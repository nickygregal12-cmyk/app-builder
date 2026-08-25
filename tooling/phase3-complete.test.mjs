import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource, normalizeWebsite, validateKnowledgePack } from '../packages/content-intelligence/src/index.js';

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

test('bounded existing-site crawl follows same-origin pages and reuses the extraction cache', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-site-crawl-'));
  const pages = {
    '/': '<html><head><title>Acme Ltd</title></head><body><h1>Acme</h1><a href="/services?utm_source=test">Services</a><a href="https://other.example/about">Other</a></body></html>',
    '/services': '<html><head><title>Services | Acme</title></head><body><h1>Services</h1><a href="/about">About</a><a href="/brochure.pdf">PDF</a></body></html>',
    '/about': '<html><head><title>About | Acme</title></head><body><h1>About</h1></body></html>',
  };
  try {
    const web = fakeWeb(pages);
    const options = { ...web, cacheDir: path.join(root, 'cache'), maxPages: 10 };
    const first = await normalizeWebsite('https://acme.example/', options);
    const second = await normalizeWebsite('https://acme.example/', options);
    assert.deepEqual(first.map((source) => new URL(source.uri).pathname), ['/', '/services', '/about']);
    assert.equal(first.every((source) => source.cacheHit === false), true);
    assert.equal(second.every((source) => source.cacheHit === true), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('mixed business pack produces stable trusted build inputs without generated claims', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-business-pack-'));
  try {
    const web = fakeWeb({
      '/': '<html><head><title>Acme Retrofit</title><meta name="description" content="Retrofit specialists"><link rel="canonical" href="https://acme.example/"><style>body{font-family:Inter, sans-serif;color:#123456}</style><script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme Ltd"}</script></head><body><h1>Retrofit specialists</h1><p>Call +44 141 555 0101 or email hello@acme.example</p><a href="/services">Services</a><img src="/team.jpg" alt="Acme team"></body></html>',
      '/services': '<html><head><title>Services</title><meta name="description" content="Survey and retrofit services"><link rel="canonical" href="https://acme.example/services"></head><body><h1>Services</h1></body></html>',
    });
    const cacheDir = path.join(root, 'cache');
    const assetOutputDir = path.join(root, 'assets');
    const website = await normalizeWebsite('https://acme.example/', { ...web, cacheDir, maxPages: 5 });
    const company = await normalizeSource({ data: Buffer.from(JSON.stringify({ company: { name: 'Acme Ltd', legalName: 'Acme Retrofit Limited', description: 'Residential retrofit contractor', email: 'hello@acme.example', phone: '0141 555 0101', address: '1 High Street, Glasgow', serviceAreas: ['Glasgow', 'Renfrewshire'], services: [{ name: 'Home survey' }, { name: 'Retrofit installation' }], testimonials: [{ quote: 'Clear and reliable', customer: 'J Smith' }], accreditations: [{ name: 'Example Quality Scheme' }] } })), name: 'company.json', label: 'Approved company data', kind: 'document', mimeType: 'application/json', provenance: 'user-supplied' }, { cacheDir });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pricing');
    sheet.addRow(['Service', 'Price']);
    sheet.addRow(['Home survey', '250']);
    sheet.addRow(['Retrofit installation', '1200']);
    const spreadsheet = await normalizeSource({ data: Buffer.from(await workbook.xlsx.writeBuffer()), name: 'pricing.xlsx', label: 'Pricing', kind: 'spreadsheet', provenance: 'user-supplied' }, { cacheDir });
    const brochure = await normalizeSource({ data: PDF_FIXTURE, name: 'brochure.pdf', label: 'Company brochure', kind: 'document', provenance: 'user-supplied' }, { cacheDir });
    const logo = await normalizeSource({ data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#123456"/><text x="120" y="240" font-size="100">ACME</text></svg>'), name: 'company-logo.svg', label: 'Company logo', kind: 'logo', provenance: 'user-supplied' }, { cacheDir, assetOutputDir, assetUriPrefix: 'assets' });
    const photoBuffer = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 120, g: 140, b: 160 } } }).jpeg().toBuffer();
    const photo = await normalizeSource({ data: photoBuffer, name: 'project-photo.jpg', label: 'Completed project photograph', kind: 'image', provenance: 'user-supplied' }, { cacheDir, assetOutputDir, assetUriPrefix: 'assets' });
    const normalized = [...website, company, spreadsheet, brochure, logo, photo];
    const pack = buildKnowledgePack(normalized, { project: { name: 'Acme website', type: 'marketing-site' } });
    assertKnowledgePack(pack);
    assert.equal(validateKnowledgePack(pack).valid, true);
    assert.equal(pack.companyProfile.identity.name.value, 'Acme Ltd');
    assert.equal(pack.companyProfile.identity.name.verification, 'user-provided');
    assert.ok(pack.companyProfile.services.length >= 2);
    assert.ok(pack.companyProfile.serviceAreas.some((item) => item.value === 'Glasgow'));
    assert.ok(pack.brand.colors.some((item) => item.value === '#123456'));
    assert.ok(pack.brand.logoCandidates.length === 1);
    assert.ok(pack.assets.some((asset) => asset.kind === 'image' && asset.variants.some((variant) => variant.format === 'avif')));
    assert.ok(pack.content.some((item) => item.kind === 'pdf'));
    assert.ok(pack.content.some((item) => item.kind === 'xlsx'));
    assert.ok(pack.chunks.length > 0);
    assert.ok(pack.research.some((item) => item.type === 'seo-summary'));
    assert.ok(pack.research.some((item) => item.type === 'local-seo-inputs' && item.serviceAreas.includes('Glasgow')));
    assert.ok(pack.research.some((item) => item.type === 'lead-generation-inputs' && item.inventedClaimsAllowed === false));
    assert.deepEqual(pack.generatedCopy, []);
    const rerunWebsite = await normalizeWebsite('https://acme.example/', { ...web, cacheDir, maxPages: 5 });
    const rerunPack = buildKnowledgePack([...rerunWebsite, company, spreadsheet, brochure, logo, photo], { project: { name: 'Acme website', type: 'marketing-site' } });
    assert.equal(rerunPack.packHash, pack.packHash, 'cache-hit state must not change the semantic knowledge-pack hash');
    assert.equal(fs.existsSync(path.join(assetOutputDir, logo.variants.find((variant) => variant.format === 'webp').uri.replace('assets/', ''))), true);
    await fsp.writeFile(path.join(root, 'knowledge-pack.json'), JSON.stringify(pack, null, 2));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
