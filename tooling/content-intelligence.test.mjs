import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { assertSafeRemoteUrl, buildKnowledgePack, normalizeSource, normalizeSources } from '../packages/content-intelligence/src/index.js';

const PDF_FIXTURE = Buffer.from('JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDgyNTEwNDgzMyswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MDgyNTEwNDgzMyswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTcwCj4+CnN0cmVhbQpHYXJWRTBiMiZTJkRSJ2hPMitTNDw/YklXIlZWakxKTEVRSWQlcyRCNXMxYkYoYDg+ZGJIYnB0OUVpKmUsYlNlTyVnOzE1Qjk2c15wa1YnbDI1YkE4ZG9APCpfST09RUAqJUBiUVs+KjAqY1tBNkxkQG1hcF4xQCtSQDtIRG4+XDBRJC1wKHIkbT9FWG5rakI9ZVwoU0pdVG9CajJqTCFzMWJWOE8vYTN+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAwOTIgMDAwMDAgbiAKMDAwMDAwMDE5OSAwMDAwMCBuIAowMDAwMDAwNDAyIDAwMDAwIG4gCjAwMDAwMDA0NzAgMDAwMDAgbiAKMDAwMDAwMDczMSAwMDAwMCBuIAowMDAwMDAwNzkwIDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDkyZmM3YzBhNGJjM2MxNGRhYWYyZWNhNDI4NjU2MTc1Pjw5MmZjN2MwYTRiYzNjMTRkYWFmMmVjYTQyODY1NjE3NT5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNSAwIFIKL1Jvb3QgNCAwIFIKL1NpemUgOAo+PgpzdGFydHhyZWYKMTA1MAolJUVPRgo=', 'base64');
const DOCX_FIXTURE = Buffer.from('UEsDBBQAAAAIAApWGV0XmADX6wAAALIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU4DMQy98xWRr2gmAweEUKc9sByBQ/kAK/HMRM2mOC3t3+NpoQdUONpvs99itQ9e7aiwS7GHm7YDRdEk6+LYw8f6pbkHxRWjRZ8i9XAghtXyarE+ZGIl4sg9TLXmB63ZTBSQ25QpCjKkErDKWEad0WxwJH3bdXfapFgp1qbOHiBmTzTg1lf1vJf96ZJCnkE9nphzWA+Ys3cGq+B6F+2vmOY7ohXlkcOTy3wtBNCXI2bo74Qf4ZuUU5wl9Y6lvmIQmv5MxWqbzDaItP3f58KlaRicobN+dsslGWKW1oNvz0hAF88f6GPlyy9QSwMEFAAAAAgAClYZXT+t/vqvAAAALAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwA0J1TRN5pWgaEUEMXhNQVlQNEiZtWNB/F4dPbk4EBKgZG/57tunnaid0x0uidgKoogaFTXo/OCLh0p/UOGCXptJy8QwEzEjSHVX3GSaY8Q8MYiGXEkYAhpbDnnNSAVlLhA7pc6X20MuUwGh6kukqDfFOWWx4/DVigrNUCYqsrYN0c8B/c9/2o8OjVzaJLP3YsOrIso8Ek4OGj5vqdLjILPJ/Dv548vABQSwMEFAAAAAgAClYZXReL0u3FAAAAIQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2PQU7EMAxF95wiyp6msECoajuDEFwAOEBIzLRSYkd2Zjpze5wRrGDz5a+v/2yPu3NO5gQsK+Fk77reGsBAccXDZD/eX28frZHqMfpECJO9gNjdfDNuQ6RwzIDVKAFl2Ca71FoG5yQskL10VAA1+yLOvqrlg9uIY2EKIKILcnL3ff/gsl/Rzor8pHi5sktz3KTOTyGDeSaUysdQ9UzzBnxalTG6ljflq5Y/3RdFp8EskBLtvYI6OPtcEvxXdT8HtOH3ufkbUEsBAhQDFAAAAAgAClYZXReYANfrAAAAsgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAAKVhldP63++q8AAAAsAQAACwAAAAAAAAAAAAAAgAEcAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAAKVhldF4vS7cUAAAAhAQAAEQAAAAAAAAAAAAAAgAH0AQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAA6AIAAAAA', 'base64');

test('text, HTML and CSV inputs become one provenance-aware knowledge pack', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-intelligence-'));
  try {
    const html = path.join(root, 'site.html'); const csv = path.join(root, 'services.csv'); const text = path.join(root, 'brief.txt');
    await fsp.writeFile(html, '<html><head><title>Acme Construction</title><meta name="description" content="Trusted retrofit specialists"><style>:root{--brand:#123456} body{font-family:Inter, sans-serif}</style></head><body><h1>Acme Construction</h1><a href="/services">Services</a><p>Email hello@acme.example</p></body></html>');
    await fsp.writeFile(csv, 'Service,Price\nSurvey,250\nRetrofit,1200\n'); await fsp.writeFile(text, 'Project brief: create a quote-led website. Call +44 141 555 0101.');
    const normalized = await normalizeSources([{ filePath: html, label: 'Existing site', provenance: 'existing-site', kind: 'url' }, { filePath: csv, label: 'Services', provenance: 'user-supplied', kind: 'spreadsheet' }, { filePath: text, label: 'Brief', provenance: 'user-supplied', kind: 'document', purpose: 'requirements brief' }], { cacheDir: path.join(root, 'cache') });
    const pack = buildKnowledgePack(normalized);
    assert.equal(pack.schemaVersion, 1); assert.ok(pack.facts.some((fact) => fact.path === 'contact.email' && fact.value === 'hello@acme.example')); assert.ok(pack.brand.colors.some((entry) => entry.value === '#123456')); assert.ok(pack.brand.fontFamilies.some((entry) => entry.value.includes('Inter'))); assert.ok(pack.content.some((entry) => entry.kind === 'csv' && entry.tables[0].rows.length === 3)); assert.equal(pack.requirements.length, 1); assert.equal(pack.generatedCopy.length, 0); assert.ok(pack.research.some((entry) => entry.type === 'existing-site-seo-snapshot'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('PDF extraction produces cached text without an AI call', async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-pdf-')); try { const source = { data: PDF_FIXTURE, name: 'brochure.pdf', label: 'Brochure', kind: 'document', provenance: 'user-supplied' }; const first = await normalizeSource(source, { cacheDir: path.join(root, 'cache') }); const second = await normalizeSource(source, { cacheDir: path.join(root, 'cache') }); assert.equal(first.extraction.type, 'pdf'); assert.match(first.extraction.text, /Acme Construction Services/); assert.equal(first.cacheHit, false); assert.equal(second.cacheHit, true); assert.equal(first.cacheKey, second.cacheKey); } finally { fs.rmSync(root, { recursive: true, force: true }); } });
test('DOCX extraction keeps semantic content as plain trusted source text', async () => { const source = await normalizeSource({ data: DOCX_FIXTURE, name: 'company.docx', label: 'Company profile', kind: 'document', provenance: 'user-supplied' }); assert.equal(source.extraction.type, 'docx'); assert.match(source.extraction.text, /Acme Construction Services/); assert.match(source.extraction.text, /hello@acme\.example/); });
test('XLSX extraction caps data into structured sheet tables', async () => { const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Pricing'); sheet.addRow(['Item', 'Price']); sheet.addRow(['Survey', 250]); sheet.addRow(['Retrofit', 1200]); const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const source = await normalizeSource({ data: buffer, name: 'pricing.xlsx', label: 'Pricing', kind: 'spreadsheet', provenance: 'user-supplied' }); assert.equal(source.extraction.type, 'xlsx'); assert.equal(source.extraction.tables[0].name, 'Pricing'); assert.deepEqual(source.extraction.tables[0].rows[1].slice(0, 2), ['Survey', '250']); });
test('image intake records metadata, responsive variants and exact duplicates', async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-assets-')); try { const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#336699"/><text x="100" y="200" font-size="80">ACME</text></svg>'); const normalized = await normalizeSources([{ data: svg, name: 'logo.svg', label: 'Company logo', kind: 'logo', provenance: 'user-supplied' }, { data: svg, name: 'logo-copy.svg', label: 'Logo copy', kind: 'image', provenance: 'user-supplied' }], { cacheDir: path.join(root, 'cache'), assetOutputDir: path.join(root, 'assets'), assetUriPrefix: 'assets' }); const pack = buildKnowledgePack(normalized); assert.equal(pack.assets.length, 2); assert.ok(pack.assets[0].metadata.width === 1600); assert.ok(pack.assets[0].variants.some((variant) => variant.role === 'responsive' && variant.format === 'webp')); assert.ok(pack.assets[0].variants.some((variant) => variant.role === 'hero-16x9' && variant.reviewBeforePublish === true)); assert.equal(pack.assets[1].duplicateOf, pack.assets[0].id); assert.ok(pack.brand.logoCandidates.includes(pack.assets[0].id)); } finally { fs.rmSync(root, { recursive: true, force: true }); } });
test('structured user data can become verified facts but generated copy stays separate', async () => { const source = await normalizeSource({ data: Buffer.from(JSON.stringify({ company: { name: 'Acme Ltd', email: 'team@acme.example', phone: '0141 555 0202' } })), name: 'company.json', label: 'Approved company data', kind: 'document', mimeType: 'application/json', provenance: 'user-supplied' }); const pack = buildKnowledgePack([source]); assert.ok(pack.facts.some((fact) => fact.path === 'identity.name' && fact.verification === 'user-provided' && fact.confidence === 1)); assert.deepEqual(pack.generatedCopy, []); });
test('remote intake rejects obvious local/private targets', () => { assert.throws(() => assertSafeRemoteUrl('http://127.0.0.1/internal'), /local\/private/); assert.throws(() => assertSafeRemoteUrl('http://localhost:3000'), /local\/private/); assert.doesNotThrow(() => assertSafeRemoteUrl('https://example.com')); });

// ---------------------------------------------------------------------------
// Operator-authored spreadsheets. Phase 3.8E asks for "a genuine user-supplied
// company document, logo, image or spreadsheet". Before the nbm trial the only
// structured company path was a JSON document shaped like
// `{ company: { ... } }`, which no business has ever handed anyone; a workbook
// carrying the legal name, company number, registered office, offices and
// service lines yielded exactly one fact, scraped out by a phone regex.
// ---------------------------------------------------------------------------

async function workbook(sheets) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

const supplied = (data, name = 'company.xlsx') => normalizeSource({
  data, name, label: 'Owner-approved company workbook', kind: 'spreadsheet',
  provenance: 'user-supplied', approvedForUse: true,
});

test('an operator fact sheet carries company identity, contact and offices', async () => {
  const source = await supplied(await workbook({
    Facts: [
      ['Field', 'Value', 'Source'],
      ['Business name', 'Northbridge Surveying', 'Public website'],
      ['Legal name', 'NORTHBRIDGE SURVEYING LIMITED', 'Companies House'],
      ['Registered office', '9 Example Crescent, Glasgow, G3 7UL', 'Companies House'],
      ['Website', 'https://northbridge.example/', 'Public website'],
      ['Telephone', '0141 555 0101', 'Public website'],
    ],
    Offices: [
      ['Location', 'Address', 'Phone'],
      ['Glasgow', '9 Example Crescent, Glasgow, G3 7UL', '0141 555 0101'],
      ['Edinburgh', '', ''],
    ],
  }));
  const profile = buildKnowledgePack([source]).companyProfile;
  assert.equal(profile.identity.name.value, 'Northbridge Surveying');
  assert.equal(profile.identity.legalName.value, 'NORTHBRIDGE SURVEYING LIMITED');
  assert.equal(profile.contact.address.value, '9 Example Crescent, Glasgow, G3 7UL');
  assert.equal(profile.contact.website.value, 'https://northbridge.example/');
  assert.equal(profile.contact.phone.value, '0141 555 0101');
  assert.deepEqual(profile.serviceAreas.map((area) => area.value), ['Glasgow', 'Edinburgh']);
});

test('what an operator wrote down is user-provided truth, not a regex candidate', async () => {
  const source = await supplied(await workbook({
    Facts: [['Field', 'Value'], ['Telephone', '0141 555 0101']],
  }));
  const phone = buildKnowledgePack([source]).companyProfile.contact.phone;
  assert.equal(phone.verification, 'user-provided');
  assert.equal(phone.confidence, 1);
});

test('the same sheet read from a crawled file stays a candidate', async () => {
  const data = await workbook({ Facts: [['Field', 'Value'], ['Business name', 'Northbridge Surveying']] });
  const source = await normalizeSource({ data, name: 'facts.xlsx', label: 'Found online', kind: 'spreadsheet', provenance: 'existing-site' });
  assert.equal(buildKnowledgePack([source]).companyProfile.identity.name.verification, 'candidate');
});

test('an unrecognised row label contributes nothing rather than being guessed at', async () => {
  const source = await supplied(await workbook({
    Facts: [
      ['Field', 'Value'],
      ['Internal notes', 'Client prefers Tuesday meetings'],
      ['Target impression', 'Credible, premium, established'],
      ['Business name', 'Northbridge Surveying'],
    ],
  }));
  const pack = buildKnowledgePack([source]);
  assert.equal(pack.companyProfile.identity.name.value, 'Northbridge Surveying');
  for (const fact of pack.facts) {
    assert.ok(!fact.value.includes('Tuesday'), 'an unknown label must not become a company fact');
    assert.ok(!fact.value.includes('Credible'), 'acceptance intent is not website copy');
  }
});

test('a two-column sheet whose value column is not a value column yields no facts', async () => {
  // "Item | Intent" is how the nbm workbook recorded the owner's acceptance
  // brief. It must never reach the site as company truth.
  const source = await supplied(await workbook({
    Intent: [['Item', 'Intent'], ['Business name', 'Credible and premium']],
  }));
  assert.deepEqual(buildKnowledgePack([source]).facts, []);
});

test('entity tables carry services, projects, people and accreditations with their detail', async () => {
  const source = await supplied(await workbook({
    Services: [
      ['Service', 'Description'],
      ['Cost Consultancy', 'Chartered quantity surveying across the project lifecycle.'],
      ["Employer's Agent", "Employer's Agent duties on design-and-build contracts."],
    ],
    Projects: [['Project', 'Location', 'Sector'], ['Riverside Refurbishment', 'Leeds', 'Hotel']],
    Team: [['Person', 'Role'], ['A. Surveyor', 'Director']],
    Memberships: [['Accreditation', 'Issuer'], ['Chartered membership', 'Example Institution']],
  }));
  const profile = buildKnowledgePack([source]).companyProfile;
  assert.deepEqual(profile.services.map((item) => item.name), ['Cost Consultancy', "Employer's Agent"]);
  assert.equal(profile.services[0].description, 'Chartered quantity surveying across the project lifecycle.');
  assert.equal(profile.services[0].verification, 'user-provided');
  assert.deepEqual(profile.projects.map((item) => [item.name, item.location, item.sector]), [['Riverside Refurbishment', 'Leeds', 'Hotel']]);
  assert.deepEqual(profile.people.map((item) => [item.name, item.role]), [['A. Surveyor', 'Director']]);
  assert.deepEqual(profile.accreditations.map((item) => item.name), ['Chartered membership']);
});

test('the pricing sheet the earlier trial relied on still works', async () => {
  const source = await supplied(await workbook({ Pricing: [['Service', 'Price'], ['Survey', '250']] }));
  const services = buildKnowledgePack([source]).companyProfile.services;
  assert.equal(services[0].name, 'Survey');
  assert.equal(services[0].price, '250');
});
