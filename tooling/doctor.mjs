#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'AGENTS.md','docs/ARCHITECTURE.md','docs/PRODUCT.md','docs/CREDIT-EFFICIENCY.md','docs/ROADMAP.md',
  'config/modules.json','config/project-types.json','config/agent-routing.json',
  'schemas/project-manifest.schema.json','schemas/build-contract.schema.json','schemas/company-profile.schema.json',
  'questionnaires/v1/base.json','tooling/create-app.mjs','apps/console/package.json'
];
let failed = false;
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`Missing required foundation file: ${rel}`);
    failed = true;
  }
}
for (const rel of ['config/modules.json','config/project-types.json','config/agent-routing.json','questionnaires/v1/base.json','schemas/project-manifest.schema.json']) {
  try { JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch { console.error(`Invalid JSON: ${rel}`); failed = true; }
}

try {
  const projectTypes = JSON.parse(fs.readFileSync(path.join(root, 'config/project-types.json'), 'utf8')).projectTypes ?? {};
  for (const [projectType, config] of Object.entries(projectTypes)) {
    const questionnaire = path.join(root, 'questionnaires', 'v1', `${config.questionnaire}.json`);
    if (!fs.existsSync(questionnaire)) {
      console.error(`Project type ${projectType} references missing questionnaire: ${config.questionnaire}`);
      failed = true;
    }
  }
} catch {
  failed = true;
}

const scanRoots = ['apps','packages','config','schemas','questionnaires','tooling','templates','recipes'];
const banned = [/euro[- ]?2028/i, /football predictor/i, /last man standing/i, /golden boot/i, /joker scoring/i];
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}
for (const base of scanRoots) {
  for (const file of walk(path.join(root, base))) {
    if (path.relative(root, file) === 'tooling/doctor.mjs') continue;
    if (!/\.(?:md|json|mjs|js|ts|tsx|css|html)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hit = banned.find((re) => re.test(text));
    if (hit) {
      console.error(`Predictor contamination guard failed: ${path.relative(root, file)} matches ${hit}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('App Builder doctor: foundation contracts present, registry references valid, JSON valid, contamination guard clean.');
