import fs from 'node:fs';
import path from 'node:path';
import { assertContract } from '@app-builder/contracts';
import { applyContentOverrides, composeProject } from '../../packages/composition/src/index.js';
import { generateProject } from './generator.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function renderModule(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;
}

function safeAssetFile(sourceDir, uri) {
  // Variant URIs come from the knowledge pack, which is data rather than
  // authority, so a traversing path must never resolve outside the ingested
  // asset directory.
  const base = path.resolve(sourceDir);
  const target = path.resolve(base, uri.replace(/^assets\//, ''));
  return target.startsWith(`${base}${path.sep}`) && fs.existsSync(target) ? target : null;
}

/**
 * Copy the variants of every placed asset into the generated repository and
 * describe them for the template. Assets the composition did not place are not
 * copied: an unplaced asset is not part of the product.
 */
function materializeAssets(composition, knowledgePack, { assetSourceDir, outputDir }) {
  const placed = new Set(composition.sections.flatMap((section) => section.assetIds));
  const assets = (knowledgePack?.assets ?? []).filter((asset) => placed.has(asset.id));
  if (!assets.length || !assetSourceDir) return {};

  const publicDir = path.join(outputDir, 'public/assets');
  const manifest = {};
  for (const asset of assets) {
    const variants = [];
    for (const variant of asset.variants ?? []) {
      const source = safeAssetFile(assetSourceDir, variant.uri);
      if (!source) continue;
      const filename = path.basename(source);
      fs.mkdirSync(publicDir, { recursive: true });
      fs.copyFileSync(source, path.join(publicDir, filename));
      variants.push({ role: variant.role, format: variant.format, width: variant.width ?? null, height: variant.height ?? null, uri: `/assets/${filename}` });
    }
    if (!variants.length) continue;
    manifest[asset.id] = {
      id: asset.id,
      kind: asset.kind,
      provenance: asset.provenance,
      assetStatus: asset.assetStatus,
      rightsStatus: asset.rightsStatus,
      alt: asset.metadata?.alt ?? null,
      variants,
    };
  }
  return manifest;
}

export function generateComposedProject(manifest, outputDir, { knowledgePack = null, assetSourceDir = null, contentOverrides = [], factoryRoot = process.cwd(), catalog } = {}) {
  const plan = generateProject(manifest, outputDir, { factoryRoot, ...(catalog ? { catalog } : {}) });
  // The composition becomes a durable artifact here, so this is where its
  // contract is enforced. Declaring the family was not enough on its own: two
  // new section types reached generated projects without ever being added to
  // the schema, because nothing validated the output.
  // Human edits are replayed over freshly composed output, so a rebuild picks
  // up new source material without discarding what someone wrote by hand.
  const composition = assertContract('composition', applyContentOverrides(composeProject({ manifest, knowledgePack }), contentOverrides));
  const out = path.resolve(outputDir);
  const assets = materializeAssets(composition, knowledgePack, { assetSourceDir, outputDir: out });
  writeJson(path.join(out, '.app-builder/composition.json'), composition);
  fs.mkdirSync(path.join(out, 'src/generated'), { recursive: true });
  fs.writeFileSync(path.join(out, 'src/generated/composition.ts'), renderModule('composition', composition));
  fs.writeFileSync(path.join(out, 'src/generated/assets.ts'), renderModule('assets', assets));
  return { plan, composition, assets };
}
