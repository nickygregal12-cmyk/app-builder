/**
 * Measure two rendered candidate sets against each other.
 *
 * Structural counts and rendered heights only. It says nothing about quality — that is the
 * critic's job, and the critic is run blind against the same two packets.
 *
 *   node tooling/b1-rendered-measure.mjs .app-builder/b1-current .app-builder/b1-planned
 */
import fs from 'node:fs';
import path from 'node:path';

const sides = process.argv.slice(2);
if (sides.length !== 2) throw new Error('Two evidence directories are required.');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function evidenceSets(root) {
  const base = path.join(root, 'service', 'evidence');
  if (!fs.existsSync(base)) return [];
  const found = [];
  for (const project of fs.readdirSync(base)) {
    const dir = path.join(base, project);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const set of fs.readdirSync(dir)) {
      const file = path.join(dir, set, 'evidence.json');
      if (fs.existsSync(file)) found.push({ dir: path.join(dir, set), evidence: readJson(file) });
    }
  }
  return found;
}

function compositions(root) {
  const base = path.join(root, 'workspaces');
  if (!fs.existsSync(base)) return [];
  const found = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === 'composition.json') found.push(readJson(full));
    }
  };
  walk(base);
  return found;
}

/** Rendered height of a full-page capture, from the PNG header. */
function pngSize(file) {
  const buffer = fs.readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const root of sides) {
  console.log(`\n================ ${root}`);
  const comps = compositions(root);
  const composition = comps[0];
  if (composition) {
    const pages = composition.pages.filter((page) => page.path !== '/404');
    console.log(`routes (excluding /404): ${pages.length}`);
    console.log(`total sections:          ${composition.sections.filter((section) => pages.some((page) => page.sectionIds.includes(section.id))).length}`);
    console.log('per route:');
    for (const page of pages) {
      const sections = composition.sections.filter((section) => page.sectionIds.includes(section.id));
      console.log(`  ${page.path.padEnd(14)} ${String(sections.length).padStart(2)} sections  [${sections.map((section) => section.type).join(' ')}]`);
    }

    // Repeated bound content, per page and across routes.
    const key = (section) => `${section.type}:${(section.bindings ?? []).map((entry) => `${entry.key}=${JSON.stringify(entry.value).slice(0, 80)}`).sort().join('|')}`;
    const repeatedOnPage = [];
    for (const page of pages) {
      const seen = new Map();
      for (const section of composition.sections.filter((entry) => page.sectionIds.includes(entry.id))) {
        seen.set(key(section), (seen.get(key(section)) ?? 0) + 1);
      }
      for (const [k, count] of seen) if (count > 1) repeatedOnPage.push(`${page.path}: ${k.split(':')[0]} x${count}`);
    }
    const routeSignature = new Map();
    const duplicateRoutes = [];
    for (const page of pages) {
      const signature = composition.sections.filter((entry) => page.sectionIds.includes(entry.id)).map(key).sort().join(' | ');
      if (!signature) continue;
      if (routeSignature.has(signature)) duplicateRoutes.push(`${page.path} == ${routeSignature.get(signature)}`);
      else routeSignature.set(signature, page.path);
    }
    console.log(`repeated content on a page: ${repeatedOnPage.length ? repeatedOnPage.join(', ') : 'none'}`);
    console.log(`routes carrying identical content: ${duplicateRoutes.length ? duplicateRoutes.join(', ') : 'none'}`);
    const reasoned = pages.filter((page) => !/^Provide the .* surface for /.test(page.purpose ?? '')).length;
    console.log(`routes with a purpose that is not the fallback sentence: ${reasoned}/${pages.length}`);
    console.log(`distinct route purposes: ${new Set(pages.map((page) => page.purpose)).size}/${pages.length}`);
  }

  const sets = evidenceSets(root);
  console.log(`\nevidence sets: ${sets.length}`);
  for (const { dir, evidence } of sets) {
    const desktop = evidence.captures.filter((capture) => capture.viewport === 'desktop' && capture.state.axis === 'viewport');
    let total = 0;
    const rows = [];
    for (const capture of desktop) {
      const file = path.join(dir, capture.file);
      if (!fs.existsSync(file)) continue;
      const { height } = pngSize(file);
      total += height;
      rows.push(`${capture.route.padEnd(14)} ${String(height).padStart(6)}px`);
    }
    console.log(`  ${path.basename(dir)}  captures=${evidence.captures.length}  uncovered=${evidence.uncovered.length}`);
    for (const row of rows) console.log(`      ${row}`);
    console.log(`      ${'TOTAL'.padEnd(14)} ${String(total).padStart(6)}px  (desktop, full-page)`);
  }
}
