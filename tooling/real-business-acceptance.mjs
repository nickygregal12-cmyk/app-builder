#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource, normalizeWebsite } from '../packages/content-intelligence/src/index.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';

const PDF_FIXTURE = Buffer.from('JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgyNTEwNDgzMyswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgyNTEwNDgzMyswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTcwCj4+CnN0cmVhbQpHYXJWRTBiMiZTJkRSJ2hPMitTNDw/YklXIlZWakxKTEVRSWQlcyRCNXMxYkYoYDg+ZGJIYnB0OUVpKmUsYlNlTyVnOzE1Qjk2c15wa1YnbDI1YkE4ZG9APCpfST09RUAqJUBiUVs+KjAqY1tBNkxkQG1hcF4xQCtSQDtIRG4+XDBRJC1wKHIkbT9FWG5rakI9ZVwoU0pdVG9CajJqTCFzMWJWOE8vYTN+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAwOTIgMDAwMDAgbiAKMDAwMDAwMDE5OSAwMDAwMCBuIAowMDAwMDAwNDAyIDAwMDAwIG4gCjAwMDAwMDA0NzAgMDAwMDAgbiAKMDAwMDAwMDczMSAwMDAwMCBuIAowMDAwMDAwNzkwIDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDkyZmM3YzBhNGJjM2MxNGRhYWYyZWNhNDI4NjU2MTc1Pjw5MmZjN2MwYTRiYzNjMTRkYWFmMmVjYTQyODY1NjE3NT5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNSAwIFIKL1Jvb3QgNCAwIFIKL1NpemUgOAo+PgpzdGFydHhyZWYKMTA1MAolJUVPRgo=', 'base64');

function fakeWeb(pages) {
  return {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      const body = pages[url.pathname];
      if (body === undefined) return new Response('Not found', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) } });
    },
  };
}

function run(command, args, cwd) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  return Date.now() - started;
}

function findSection(composition, type) { return composition.sections.find((section) => section.type === type); }
function findBinding(section, key) { return section?.bindings.find((binding) => binding.key === key); }

const root = path.resolve('.tmp/real-business-acceptance');
const cacheDir = path.join(root, 'cache');
const assetOutputDir = path.join(root, 'source-assets');
const stateRoot = path.join(root, 'service-state');
const workspacesRoot = path.join(root, 'workspaces');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const web = fakeWeb({
  '/': '<html><head><title>Acme Retrofit</title><meta name="description" content="Retrofit specialists"><link rel="canonical" href="https://acme.example/"><style>body{font-family:Inter,sans-serif;color:#123456}</style></head><body><h1>Retrofit specialists</h1><p>Call +44 141 555 0101 or email hello@acme.example</p><a href="/services">Services</a><img src="/team.jpg" alt="Acme team"></body></html>',
  '/services': '<html><head><title>Services | Acme Retrofit</title><meta name="description" content="Survey and retrofit services"><link rel="canonical" href="https://acme.example/services"></head><body><h1>Services</h1><p>Residential survey and retrofit installation.</p></body></html>',
});

const website = await normalizeWebsite('https://acme.example/', { ...web, cacheDir, maxPages: 5 });
const approvedCompany = await normalizeSource({
  data: Buffer.from(JSON.stringify({ company: {
    name: 'Acme Ltd', legalName: 'Acme Retrofit Limited', description: 'Residential retrofit contractor',
    email: 'hello@acme.example', phone: '0141 555 0101', address: '1 High Street, Glasgow',
    serviceAreas: ['Glasgow', 'Renfrewshire'],
    services: [{ name: 'Home survey' }, { name: 'Retrofit installation' }],
    testimonials: [{ quote: 'Clear and reliable', customer: 'J Smith' }],
    accreditations: [{ name: 'Example Quality Scheme' }],
  } })),
  name: 'company.json', label: 'Approved company data', kind: 'document', mimeType: 'application/json', provenance: 'user-supplied', purpose: 'approved company profile',
}, { cacheDir });
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Pricing');
sheet.addRow(['Service', 'Price']);
sheet.addRow(['Home survey', '250']);
sheet.addRow(['Retrofit installation', '1200']);
const spreadsheet = await normalizeSource({ data: Buffer.from(await workbook.xlsx.writeBuffer()), name: 'pricing.xlsx', label: 'Pricing', kind: 'spreadsheet', provenance: 'user-supplied' }, { cacheDir });
const brochure = await normalizeSource({ data: PDF_FIXTURE, name: 'brochure.pdf', label: 'Company brochure', kind: 'document', provenance: 'user-supplied' }, { cacheDir });
const logo = await normalizeSource({ data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#123456"/><text x="120" y="240" font-size="100">ACME</text></svg>'), name: 'company-logo.svg', label: 'Company logo', kind: 'logo', provenance: 'user-supplied' }, { cacheDir, assetOutputDir, assetUriPrefix: 'assets' });
const photoBuffer = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 120, g: 140, b: 160 } } }).jpeg().toBuffer();
const photo = await normalizeSource({ data: photoBuffer, name: 'project-photo.jpg', label: 'Completed retrofit project', kind: 'image', provenance: 'user-supplied' }, { cacheDir, assetOutputDir, assetUriPrefix: 'assets' });

const pack = assertKnowledgePack(buildKnowledgePack([...website, approvedCompany, spreadsheet, brochure, logo, photo], { project: { name: 'Acme Retrofit', type: 'marketing-site' } }));
fs.writeFileSync(path.join(root, 'knowledge-pack.json'), JSON.stringify(pack, null, 2) + '\n');
const sourceRefs = pack.sources.map((source) => ({ id: source.id, kind: source.kind, label: source.label, uri: source.uri, provenance: source.provenance, purpose: source.purpose, recordedAt: '2026-08-25T00:00:00.000Z' }));
const manifest = {
  schemaVersion: 2,
  project: { name: 'Acme Retrofit', slug: 'acme-retrofit', type: 'marketing-site', primaryGoal: 'Generate qualified residential retrofit enquiries.' },
  audience: { targetUsers: 'Homeowners planning residential retrofit work', roles: [] },
  journeys: ['Understand retrofit services', 'Review trust evidence and service areas', 'Contact Acme about a project'],
  majorSurfaces: ['Home', 'Services', 'About', 'Contact'],
  entities: [],
  company: { identity: {}, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: ['email'] },
  modules: { seo: true, 'lead-generation': true, analytics: true, observability: true },
  infrastructure: { backend: 'none', deployment: 'netlify' },
  aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
  brand: { designControl: 'sensible-defaults', accentColor: '#123456' },
  inputs: { inventory: ['existing website', 'logo/brand', 'photos', 'PDFs/docs', 'spreadsheets/CSV'], existingWebsite: 'https://acme.example/', sources: sourceRefs },
  constraints: { tenantModel: null, integrations: [], uploads: {}, existingData: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', hardConstraints: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
  outOfScope: ['Online payments'],
};
fs.writeFileSync(path.join(root, 'project-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const store = new FactoryStore({ stateRoot });
const service = new FactoryService({ store, workspacesRoot });
const project = service.createProject({ id: 'project-acme-retrofit', manifest, knowledgePack: pack });
await service.recordOperationalEvent(project.id, 'ingest.completed', { knowledgePackHash: pack.packHash, sources: pack.sources.length, facts: pack.facts.length, assets: pack.assets.length });
const build = await service.generateProject(project.id);
const { composition } = build;
const appDir = build.workspace;
const inventory = JSON.parse(fs.readFileSync(path.join(appDir, '.app-builder/recipe-installations.json'), 'utf8'));
if (composition.warnings.length) throw new Error(`Real-business composition has warnings: ${composition.warnings.join(', ')}`);

const heroTitle = findBinding(findSection(composition, 'hero'), 'title');
if (heroTitle?.value !== 'Acme Ltd' || heroTitle.origin !== 'knowledge-fact' || heroTitle.generated) throw new Error('Hero title did not retain the approved company fact and provenance.');
const services = findBinding(findSection(composition, 'item-grid'), 'items');
if (services?.origin !== 'knowledge-entity' || !services.entityIds.length || !services.sourceIds.length) throw new Error('Services were not bound from source-backed knowledge entities.');
if (!services.value.some((item) => item.name === 'Home survey') || !services.value.some((item) => item.name === 'Retrofit installation')) throw new Error('Expected source-backed services are missing from composition.');
const proof = findSection(composition, 'proof-grid');
if (!findBinding(proof, 'testimonials') || !findBinding(proof, 'accreditations')) throw new Error('Source-backed trust evidence is missing from composition.');
const locations = findBinding(findSection(composition, 'location-list'), 'items');
if (locations?.origin !== 'knowledge-fact' || !locations.value.some((item) => item.name === 'Glasgow')) throw new Error('Source-backed service areas are missing from composition.');
const contact = findSection(composition, 'contact-panel');
if (findBinding(contact, 'email')?.value !== 'hello@acme.example' || findBinding(contact, 'phone')?.value !== '0141 555 0101') throw new Error('Approved contact facts are missing from composition.');
for (const section of composition.sections) for (const item of section.bindings) if (item.origin.startsWith('knowledge-') && item.generated) throw new Error(`Source-backed binding ${section.id}/${item.key} was incorrectly marked generated.`);

const installDuration = run('npm', ['install', '--no-audit', '--no-fund'], appDir);
await service.recordOperationalEvent(project.id, 'quality.install.succeeded', { workspace: appDir }, { durationMs: installDuration });
const checkDuration = run('npm', ['run', 'check'], appDir);
await service.recordOperationalEvent(project.id, 'quality.check.succeeded', { workspace: appDir }, { durationMs: checkDuration });
const buildDuration = run('npm', ['run', 'build'], appDir);
await service.recordOperationalEvent(project.id, 'quality.build.succeeded', { workspace: appDir }, { durationMs: buildDuration });

const report = {
  schemaVersion: 2,
  project: manifest.project,
  knowledgePackHash: pack.packHash,
  sources: pack.sources.length,
  facts: pack.facts.length,
  assets: pack.assets.length,
  pages: composition.pages.length,
  sections: composition.sections.length,
  compositionHash: composition.compositionHash,
  installedRecipes: inventory.installed.map((item) => item.recipeId),
  warnings: composition.warnings,
  service: {
    projectId: project.id,
    taskId: build.task.id,
    checkpointId: build.checkpoint.id,
    database: path.relative(root, store.databasePath),
    ledger: path.relative(root, store.ledgerPath),
    metrics: service.metrics(project.id),
    eventTypes: service.listEvents(project.id).map((event) => event.type),
  },
  gates: { knowledgePack: true, provenance: true, serviceBuild: true, eventLedger: true, sqliteProjection: true, independentInstall: true, independentCheck: true, independentBuild: true },
};
fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
store.close();
console.log(`Real-business acceptance ready: ${appDir}`);
console.log(JSON.stringify(report, null, 2));
