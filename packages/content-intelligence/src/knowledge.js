import { sha256, stableId } from './shared.js';

const VERIFICATION_RANK = { rejected: 0, candidate: 1, verified: 2, 'user-provided': 3 };

function primitiveObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { name: String(value ?? '') };
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item)));
}

function addFact(factMap, fact) {
  const valueKey = typeof fact.value === 'string' ? fact.value.toLowerCase() : JSON.stringify(fact.value);
  const key = `${fact.path}::${valueKey}`;
  const evidence = { sourceId: fact.sourceId, provenance: fact.provenance, confidence: fact.confidence, verification: fact.verification };
  const existing = factMap.get(key);
  if (existing) {
    if (!existing.evidence.some((item) => item.sourceId === evidence.sourceId)) existing.evidence.push(evidence);
    existing.confidence = Math.max(existing.confidence, fact.confidence);
    if ((VERIFICATION_RANK[fact.verification] ?? 0) > (VERIFICATION_RANK[existing.verification] ?? 0)) existing.verification = fact.verification;
    return existing;
  }
  const created = { id: stableId('fact', fact.path, valueKey), ...fact, evidence: [evidence] };
  factMap.set(key, created);
  return created;
}

function addEntity(target, kind, value, source, verification) {
  if (value === undefined || value === null || value === '') return;
  const data = primitiveObject(value);
  if (!Object.values(data).some((item) => item !== '')) return;
  target[kind].push({
    id: stableId(kind.slice(0, -1) || kind, source.id, JSON.stringify(data)),
    ...data,
    sourceId: source.id,
    provenance: source.provenance,
    verification,
  });
}

function structuredCompany(source, factMap, entities) {
  if (source.extraction.type !== 'json') return;
  const raw = source.extraction.structuredData;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return;
  const company = raw.company && typeof raw.company === 'object' && !Array.isArray(raw.company) ? raw.company : raw;
  const verification = source.provenance === 'user-supplied' ? 'user-provided' : 'candidate';
  const confidence = verification === 'user-provided' ? 1 : 0.85;
  const fields = [
    ['identity.name', company.name ?? company.companyName],
    ['identity.legalName', company.legalName],
    ['identity.description', company.description ?? company.about],
    ['contact.email', company.email],
    ['contact.phone', company.phone ?? company.telephone],
    ['contact.website', company.website ?? company.url],
    ['contact.address', typeof company.address === 'string' ? company.address : null],
  ];
  for (const [factPath, value] of fields) {
    if (typeof value !== 'string' || !value.trim()) continue;
    addFact(factMap, { path: factPath, value: value.trim(), sourceId: source.id, provenance: source.provenance, confidence, verification });
  }
  for (const value of Array.isArray(company.serviceAreas) ? company.serviceAreas : []) {
    if (typeof value === 'string' && value.trim()) addFact(factMap, { path: 'serviceAreas', value: value.trim(), sourceId: source.id, provenance: source.provenance, confidence, verification });
  }
  const entityFields = [['services', company.services], ['people', company.people ?? company.team], ['projects', company.projects ?? company.caseStudies], ['testimonials', company.testimonials], ['accreditations', company.accreditations]];
  for (const [kind, values] of entityFields) for (const value of Array.isArray(values) ? values : []) addEntity(entities, kind, value, source, verification);
}

/**
 * Spreadsheets are what businesses actually hand over.
 *
 * Before the Phase 3.8E nbm trial the only structured company path was a JSON
 * document shaped like `{ company: { name, services, ... } }` — a shape no real
 * business has ever supplied. A workbook carrying the company's legal name,
 * number, registered office, offices and service lines produced exactly one
 * fact, scraped out of the flattened text by a phone-number regex, and the
 * generated site had to be told who the company was by hand.
 *
 * Everything below is a closed allowlist. An unrecognised column heading or row
 * label contributes nothing: guessing that a column called "Notes" is the
 * company description would put unverified text on a client's website, which is
 * exactly what `instructionAuthority: none` exists to prevent.
 */

/** Row labels a fact sheet may use, and the fact path each one means. */
const FACT_SHEET_LABELS = new Map(Object.entries({
  'business name': 'identity.name',
  'company name': 'identity.name',
  'trading name': 'identity.name',
  name: 'identity.name',
  'legal name': 'identity.legalName',
  'registered name': 'identity.legalName',
  description: 'identity.description',
  about: 'identity.description',
  'what we do': 'identity.description',
  email: 'contact.email',
  'email address': 'contact.email',
  phone: 'contact.phone',
  telephone: 'contact.phone',
  'phone number': 'contact.phone',
  website: 'contact.website',
  url: 'contact.website',
  address: 'contact.address',
  'registered office': 'contact.address',
  'registered address': 'contact.address',
}));

const LABEL_COLUMNS = ['field', 'item', 'attribute', 'property', 'key', 'label'];
const VALUE_COLUMNS = ['value', 'answer', 'content', 'response', 'detail', 'details'];

const ENTITY_TABLES = [
  { kind: 'services', names: ['service', 'services', 'product', 'offering'], extra: { description: ['description', 'summary', 'detail', 'details'], price: ['price', 'cost', 'rate'] } },
  { kind: 'projects', names: ['project', 'projects', 'case study', 'case studies', 'scheme'], extra: { description: ['description', 'summary', 'detail', 'details'], location: ['location', 'place', 'where'], sector: ['sector', 'type', 'category'] } },
  { kind: 'people', names: ['person', 'people', 'team member', 'staff'], extra: { role: ['role', 'title', 'position', 'job title'] } },
  { kind: 'accreditations', names: ['accreditation', 'accreditations', 'certification', 'membership'], extra: { issuer: ['issuer', 'body', 'awarded by'] } },
  { kind: 'testimonials', names: ['testimonial', 'testimonials', 'quote'], extra: { customer: ['customer', 'client', 'author', 'attribution'] } },
];

/** Office/location tables name places the company serves, which are facts rather than entities. */
const LOCATION_COLUMNS = ['location', 'locations', 'office', 'offices', 'area', 'areas', 'region', 'branch'];

const normalize = (value) => String(value ?? '').trim();
const headerKey = (value) => normalize(value).toLowerCase();

function columnIndex(header, names) {
  return header.findIndex((value) => names.includes(value));
}

function spreadsheetFacts(source, factMap, entities) {
  if (!['csv', 'xlsx'].includes(source.extraction.type)) return;
  // Only an operator hands the factory a workbook. Content extracted from a
  // downloaded file keeps the weaker verification the crawler earned.
  const verification = source.provenance === 'user-supplied' ? 'user-provided' : 'candidate';
  const confidence = verification === 'user-provided' ? 1 : 0.85;

  for (const table of source.extraction.tables ?? []) {
    const [rawHeader, ...rows] = table.rows ?? [];
    if (!rawHeader) continue;
    const header = rawHeader.map(headerKey);

    // 1. A two-column fact sheet: one column names the field, another holds it.
    const labelIndex = columnIndex(header, LABEL_COLUMNS);
    const valueIndex = columnIndex(header, VALUE_COLUMNS);
    if (labelIndex >= 0 && valueIndex >= 0) {
      for (const row of rows) {
        const path = FACT_SHEET_LABELS.get(headerKey(row[labelIndex]));
        const value = normalize(row[valueIndex]);
        if (!path || !value) continue;
        addFact(factMap, { path, value, sourceId: source.id, provenance: source.provenance, confidence, verification });
      }
    }

    // 2. A table of things the company offers, did, or is.
    for (const definition of ENTITY_TABLES) {
      const nameIndex = columnIndex(header, definition.names);
      if (nameIndex < 0) continue;
      for (const row of rows) {
        const name = normalize(row[nameIndex]);
        if (!name) continue;
        const value = { name };
        for (const [field, candidates] of Object.entries(definition.extra)) {
          const index = columnIndex(header, candidates);
          if (index >= 0 && normalize(row[index])) value[field] = normalize(row[index]);
        }
        addEntity(entities, definition.kind, value, source, verification);
      }
    }

    // 3. Where the company works. An office row may also carry the only address
    //    or phone number the operator supplied.
    const locationIndex = columnIndex(header, LOCATION_COLUMNS);
    if (locationIndex >= 0) {
      const addressIndex = columnIndex(header, ['address', 'street address', 'postal address']);
      const phoneIndex = columnIndex(header, ['phone', 'telephone', 'phone number']);
      for (const row of rows) {
        const area = normalize(row[locationIndex]);
        if (!area) continue;
        addFact(factMap, { path: 'serviceAreas', value: area, sourceId: source.id, provenance: source.provenance, confidence, verification });
        if (addressIndex >= 0 && normalize(row[addressIndex])) {
          addFact(factMap, { path: 'contact.address', value: normalize(row[addressIndex]), sourceId: source.id, provenance: source.provenance, confidence, verification });
        }
        if (phoneIndex >= 0 && normalize(row[phoneIndex])) {
          addFact(factMap, { path: 'contact.phone', value: normalize(row[phoneIndex]), sourceId: source.id, provenance: source.provenance, confidence, verification });
        }
      }
    }
  }
}

const SOCIAL_PLATFORMS = Object.freeze(['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'pinterest']);

function socialPlatform(url) {
  let host = '';
  try { host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  return SOCIAL_PLATFORMS.find((name) => host === `${name}.com` || host.endsWith(`.${name}.com`)) ?? null;
}

// A business site almost always links its own social profiles from the header
// or footer. Those links are the profile identities themselves, so they are
// facts about the company rather than content that needs republishing rights.
function socialProfileFacts(source, factMap) {
  for (const href of source.extraction.links ?? []) {
    const platform = socialPlatform(href);
    if (!platform) continue;
    addFact(factMap, { path: `contact.social.${platform}`, value: String(href), sourceId: source.id, provenance: source.provenance, confidence: 0.9, verification: 'candidate' });
  }
}

function contactFacts(source, factMap) {
  const text = source.extraction.text ?? '';
  for (const email of text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []) {
    addFact(factMap, { path: 'contact.email', value: email, sourceId: source.id, provenance: source.provenance, confidence: 0.96, verification: 'candidate' });
  }
  for (const match of text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? []) {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    addFact(factMap, { path: 'contact.phone', value: match.replace(/\s+/g, ' ').trim(), sourceId: source.id, provenance: source.provenance, confidence: 0.82, verification: 'candidate' });
  }
}

function chunksForSource(source, maxChars = 6000, overlap = 400) {
  const text = String(source.extraction.text ?? '').trim();
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + Math.floor(maxChars * 0.6)) end = paragraphBreak;
    }
    const chunkText = text.slice(start, end).trim();
    if (chunkText) {
      const contentHash = sha256(chunkText);
      chunks.push({ contentHash, text: chunkText, sourceId: source.id, provenance: source.provenance, start, end, approxTokens: Math.ceil(chunkText.length / 4) });
    }
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function mergeChunks(sources) {
  const byHash = new Map();
  for (const source of sources) {
    for (const chunk of chunksForSource(source)) {
      const existing = byHash.get(chunk.contentHash);
      if (existing) {
        if (!existing.sourceIds.includes(chunk.sourceId)) existing.sourceIds.push(chunk.sourceId);
        continue;
      }
      byHash.set(chunk.contentHash, {
        id: `chunk-${chunk.contentHash.slice(0, 16)}`,
        contentHash: chunk.contentHash,
        text: chunk.text,
        sourceIds: [chunk.sourceId],
        provenance: chunk.provenance,
        approxTokens: chunk.approxTokens,
      });
    }
  }
  return [...byHash.values()];
}

function bestFact(facts, path) {
  return facts
    .filter((fact) => fact.path === path && fact.verification !== 'rejected')
    .sort((a, b) => (VERIFICATION_RANK[b.verification] ?? 0) - (VERIFICATION_RANK[a.verification] ?? 0) || b.confidence - a.confidence)[0] ?? null;
}

function createCompanyProfile(facts, entities) {
  const field = (path) => {
    const fact = bestFact(facts, path);
    return fact ? { value: fact.value, factId: fact.id, verification: fact.verification, confidence: fact.confidence } : null;
  };
  return {
    identity: { name: field('identity.name'), legalName: field('identity.legalName'), description: field('identity.description') },
    contact: { email: field('contact.email'), phone: field('contact.phone'), website: field('contact.website'), address: field('contact.address') },
    socialProfiles: facts
      .filter((fact) => fact.path.startsWith('contact.social.'))
      .map((fact) => ({ platform: fact.path.slice('contact.social.'.length), value: fact.value, factId: fact.id, verification: fact.verification })),
    serviceAreas: facts.filter((fact) => fact.path === 'serviceAreas').map((fact) => ({ value: fact.value, factId: fact.id, verification: fact.verification })),
    services: entities.services,
    people: entities.people,
    projects: entities.projects,
    testimonials: entities.testimonials,
    accreditations: entities.accreditations,
  };
}

function seoSnapshot(source) {
  const extraction = source.extraction;
  const h1Count = (extraction.headings ?? []).filter((heading) => heading.level === 1).length;
  const missingAlt = (extraction.images ?? []).filter((image) => !String(image.alt ?? '').trim()).length;
  const issues = [];
  if (!extraction.metadata?.title) issues.push('missing-title');
  if (!extraction.metadata?.description) issues.push('missing-meta-description');
  if (h1Count !== 1) issues.push(h1Count === 0 ? 'missing-h1' : 'multiple-h1');
  if (!extraction.metadata?.canonical) issues.push('missing-canonical');
  if (missingAlt > 0) issues.push('images-missing-alt');
  return {
    id: stableId('research', source.id, 'seo'),
    type: 'existing-site-seo-snapshot',
    sourceId: source.id,
    title: extraction.metadata?.title ?? '',
    description: extraction.metadata?.description ?? '',
    canonical: extraction.metadata?.canonical ?? '',
    h1Count,
    imageCount: extraction.images?.length ?? 0,
    imagesMissingAlt: missingAlt,
    jsonLdTypes: extraction.metadata?.jsonLdTypes ?? [],
    issues,
  };
}

function packLevelResearch(facts, entities, pageSnapshots) {
  const contactMethods = ['contact.email', 'contact.phone', 'contact.website'].filter((factPath) => bestFact(facts, factPath)).map((factPath) => factPath.replace('contact.', ''));
  const serviceAreas = facts.filter((fact) => fact.path === 'serviceAreas').map((fact) => fact.value);
  return [
    {
      id: stableId('research', 'seo-summary', pageSnapshots.length, JSON.stringify(pageSnapshots.flatMap((page) => page.issues))),
      type: 'seo-summary',
      pageCount: pageSnapshots.length,
      pagesWithIssues: pageSnapshots.filter((page) => page.issues.length).length,
      issueCounts: Object.fromEntries([...new Set(pageSnapshots.flatMap((page) => page.issues))].map((issue) => [issue, pageSnapshots.filter((page) => page.issues.includes(issue)).length])),
    },
    {
      id: stableId('research', 'local-seo', JSON.stringify(serviceAreas)),
      type: 'local-seo-inputs',
      addressFactId: bestFact(facts, 'contact.address')?.id ?? null,
      phoneFactId: bestFact(facts, 'contact.phone')?.id ?? null,
      serviceAreas,
      generatedLocations: [],
    },
    {
      id: stableId('research', 'lead-generation', contactMethods.join(','), entities.services.length),
      type: 'lead-generation-inputs',
      contactMethods,
      serviceCount: entities.services.length,
      testimonialCount: entities.testimonials.length,
      accreditationCount: entities.accreditations.length,
      inventedClaimsAllowed: false,
    },
  ];
}

function assetGovernance(source) {
  return {
    provenance: source.provenance,
    rightsStatus: source.rightsStatus,
    assetStatus: source.assetStatus,
    sourceRole: source.sourceRole,
    sourceChannel: source.sourceChannel,
    instructionAuthority: source.instructionAuthority,
    publishUseAllowed: source.publishUseAllowed,
  };
}

export function buildKnowledgePack(normalizedSources, options = {}) {
  const factMap = new Map();
  const content = [];
  const assets = [];
  const references = [];
  const requirements = [];
  const research = [];
  const colorMap = new Map();
  const fontMap = new Map();
  const titles = [];
  const exactAssets = new Map();
  const visualAssets = new Map();
  const entities = { services: [], people: [], projects: [], testimonials: [], accreditations: [] };
  const pageSnapshots = [];
  for (const source of normalizedSources) {
    structuredCompany(source, factMap, entities);
    spreadsheetFacts(source, factMap, entities);
    contactFacts(source, factMap);
    socialProfileFacts(source, factMap);
    const extraction = source.extraction;
    if (extraction.metadata?.title) {
      titles.push({ value: extraction.metadata.title, sourceId: source.id });
      addFact(factMap, { path: 'identity.nameCandidate', value: extraction.metadata.title, sourceId: source.id, provenance: source.provenance, confidence: 0.55, verification: 'candidate' });
    }
    for (const color of extraction.metadata?.colors ?? []) {
      const current = colorMap.get(color) ?? { value: color, sourceIds: [] };
      if (!current.sourceIds.includes(source.id)) current.sourceIds.push(source.id);
      colorMap.set(color, current);
    }
    for (const font of extraction.metadata?.fontFamilies ?? []) {
      const current = fontMap.get(font) ?? { value: font, sourceIds: [] };
      if (!current.sourceIds.includes(source.id)) current.sourceIds.push(source.id);
      fontMap.set(font, current);
    }
    if (extraction.type === 'image') {
      const asset = {
        id: stableId('asset', source.contentHash, source.id),
        sourceId: source.id,
        kind: source.kind,
        contentHash: source.contentHash,
        mimeType: source.mimeType,
        ...assetGovernance(source),
        metadata: extraction.metadata,
        variants: source.variants,
      };
      if (exactAssets.has(source.contentHash)) asset.duplicateOf = exactAssets.get(source.contentHash);
      else exactAssets.set(source.contentHash, asset.id);
      const fingerprint = extraction.metadata?.visualFingerprint;
      if (!asset.duplicateOf && fingerprint && visualAssets.has(fingerprint)) asset.visualDuplicateOf = visualAssets.get(fingerprint);
      else if (fingerprint) visualAssets.set(fingerprint, asset.id);
      assets.push(asset);
    } else {
      content.push({ id: stableId('content', source.id, extraction.type), sourceId: source.id, kind: extraction.type, text: extraction.text ?? '', headings: extraction.headings ?? [], tables: extraction.tables ?? [], metadata: extraction.metadata ?? {}, truncated: Boolean(extraction.truncated) });
    }
    if (/^https?:/i.test(source.uri ?? '')) references.push({ id: stableId('reference', source.uri), type: 'source-url', value: source.uri, sourceId: source.id });
    for (const link of extraction.links ?? []) references.push({ id: stableId('reference', source.id, link), type: 'link', value: link, sourceId: source.id });
    for (const image of extraction.images ?? []) references.push({ id: stableId('reference', source.id, image.src), type: 'image-reference', value: image.src, label: image.alt || undefined, sourceId: source.id });
    if (/requirement|brief|scope/i.test(source.purpose ?? '')) requirements.push({ id: stableId('requirement', source.id), sourceId: source.id, text: extraction.text ?? '', provenance: source.provenance });
    if (extraction.type === 'html') {
      const snapshot = seoSnapshot(source);
      pageSnapshots.push(snapshot);
      research.push(snapshot);
    }
  }
  const facts = [...factMap.values()];
  research.push(...packLevelResearch(facts, entities, pageSnapshots));
  const sources = normalizedSources.map(({ extraction, variants, ...source }) => ({
    ...source,
    extractionSummary: { type: extraction.type, truncated: Boolean(extraction.truncated), cacheHit: source.cacheHit },
    variantCount: variants.length,
  }));
  const brandSources = sources
    .filter((source) => source.sourceRole === 'primary-brand' || source.sourceRole === 'brand-supporting')
    .map((source) => ({ sourceId: source.id, role: source.sourceRole, channel: source.sourceChannel, rightsStatus: source.rightsStatus, publishUseAllowed: source.publishUseAllowed }));
  const brand = {
    colors: [...colorMap.values()].sort((a, b) => b.sourceIds.length - a.sourceIds.length || a.value.localeCompare(b.value)),
    fontFamilies: [...fontMap.values()].sort((a, b) => b.sourceIds.length - a.sourceIds.length || a.value.localeCompare(b.value)),
    titles,
    sourceCandidates: brandSources,
    logoCandidates: assets.filter((asset) => asset.kind === 'logo').map((asset) => asset.id),
    screenshotCandidates: assets.filter((asset) => asset.kind === 'screenshot').map((asset) => asset.id),
    publishableAssetIds: assets.filter((asset) => asset.publishUseAllowed).map((asset) => asset.id),
    referenceOnlyAssetIds: assets.filter((asset) => !asset.publishUseAllowed).map((asset) => asset.id),
    generatedBrandClaims: [],
  };
  const chunks = mergeChunks(normalizedSources);
  const companyProfile = createCompanyProfile(facts, entities);
  const base = {
    schemaVersion: 1,
    intelligenceVersion: options.intelligenceVersion ?? '1.2.0',
    project: options.project ?? null,
    sources,
    facts,
    companyProfile,
    brand,
    assets,
    content,
    chunks,
    references,
    requirements,
    research,
    generatedCopy: [],
  };
  return { ...base, packHash: sha256(JSON.stringify(base)) };
}
