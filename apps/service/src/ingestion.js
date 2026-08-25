import fs from 'node:fs';
import path from 'node:path';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource, normalizeWebsite } from '@app-builder/content-intelligence';

// Source ingestion is a service capability so the Console never has to parse
// bytes itself or hand the factory a filesystem path. Clients describe a
// remote URL or send file content inline; everything else — where bytes land,
// how far a crawl reaches, what governance a source carries — is decided here.

export const INGESTION_LIMITS = Object.freeze({
  maxSourcesPerRequest: 20,
  maxUploadBytes: 12 * 1024 * 1024,
  maxCrawlPages: 25,
  defaultCrawlPages: 8,
});

const RIGHTS_STATUSES = ['approved-for-use', 'reference-only', 'unknown', 'restricted'];
const ASSET_STATUSES = ['approved', 'suggested', 'generated', 'rejected', 'do-not-use'];
const PROVENANCES = ['user-supplied', 'existing-site', 'external-research', 'generated'];

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Source ${label} is required.`);
  return text;
}

function optionalEnum(value, allowed, label) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value);
  if (!allowed.includes(text)) throw new Error(`Source ${label} must be one of: ${allowed.join(', ')}.`);
  return text;
}

// Declared governance is accepted from the operator because only they know what
// the business has approved. It is never inferred from "the file was uploaded",
// and rights can only be narrowed by the deterministic rules downstream.
function declaredGovernance(input) {
  return {
    purpose: input.purpose ? String(input.purpose) : null,
    // Stock and generated imagery must be recorded as such. Without this a
    // placeholder becomes indistinguishable from a photograph of the business's
    // own work once it is in the knowledge pack.
    provenance: optionalEnum(input.provenance, PROVENANCES, 'provenance'),
    rightsStatus: optionalEnum(input.rightsStatus, RIGHTS_STATUSES, 'rightsStatus'),
    assetStatus: optionalEnum(input.assetStatus, ASSET_STATUSES, 'assetStatus'),
    approvedForUse: input.approvedForUse === true ? true : undefined,
  };
}

function uploadBytes(input) {
  const encoded = String(input.contentBase64 ?? '');
  if (!encoded) throw new Error(`Uploaded source ${input.name ?? 'unknown'} has no contentBase64 payload.`);
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) throw new Error(`Uploaded source ${input.name ?? 'unknown'} decoded to zero bytes.`);
  if (buffer.length > INGESTION_LIMITS.maxUploadBytes) {
    throw new Error(`Uploaded source ${input.name ?? 'unknown'} exceeds the ${Math.round(INGESTION_LIMITS.maxUploadBytes / (1024 * 1024))} MB service limit.`);
  }
  return buffer;
}

export function parseSourceRequests(value) {
  if (!Array.isArray(value) || !value.length) throw new Error('Ingestion requires a non-empty sources array.');
  if (value.length > INGESTION_LIMITS.maxSourcesPerRequest) {
    throw new Error(`Ingestion accepts at most ${INGESTION_LIMITS.maxSourcesPerRequest} sources per request.`);
  }
  return value.map((input) => {
    if (!input || typeof input !== 'object') throw new Error('Every source must be an object.');
    const governance = declaredGovernance(input);
    if (input.filePath) throw new Error('Sources cannot reference a filesystem path. Send file content inline instead.');

    if (input.uri) {
      const uri = requireText(input.uri, 'uri');
      if (!/^https?:\/\//i.test(uri)) throw new Error('Only http(s) source URLs can be ingested.');
      const pages = input.crawl === false ? 1 : Number(input.maxPages ?? INGESTION_LIMITS.defaultCrawlPages);
      if (!Number.isInteger(pages) || pages < 1 || pages > INGESTION_LIMITS.maxCrawlPages) {
        throw new Error(`maxPages must be an integer from 1 to ${INGESTION_LIMITS.maxCrawlPages}.`);
      }
      return { type: 'url', uri, label: input.label ? String(input.label) : uri, maxPages: pages, ...governance };
    }

    return {
      type: 'upload',
      name: requireText(input.name, 'name'),
      label: input.label ? String(input.label) : requireText(input.name, 'name'),
      mimeType: input.mimeType ? String(input.mimeType) : undefined,
      data: uploadBytes(input),
      ...governance,
    };
  });
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.uri ?? ''}::${source.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sourceSummary(source) {
  return {
    id: source.id,
    kind: source.kind,
    label: source.label,
    uri: source.uri,
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    provenance: source.provenance,
    purpose: source.purpose,
    rightsStatus: source.rightsStatus,
    assetStatus: source.assetStatus,
    sourceRole: source.sourceRole,
    sourceChannel: source.sourceChannel,
    instructionAuthority: source.instructionAuthority,
    publishUseAllowed: source.publishUseAllowed,
    contentHash: source.contentHash,
  };
}

export function knowledgeSummary(pack) {
  if (!pack) return null;
  return {
    packHash: pack.packHash,
    intelligenceVersion: pack.intelligenceVersion,
    sources: pack.sources.map(sourceSummary),
    factCount: pack.facts.length,
    assetCount: pack.assets.length,
    chunkCount: pack.chunks.length,
    publishableAssetCount: pack.assets.filter((asset) => asset.publishUseAllowed).length,
    companyName: pack.companyProfile?.identity?.name?.value ?? null,
  };
}

export class SourceIngestion {
  constructor({ stateRoot }) {
    this.root = path.resolve(stateRoot, 'sources');
  }

  projectRoot(projectId) {
    // Project identifiers are service-generated, but they still reach this code
    // from an HTTP path segment, so the directory is resolved and re-checked
    // rather than trusted.
    const base = path.resolve(this.root);
    const target = path.resolve(base, projectId);
    if (target === base || !target.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe project source directory: ${projectId}`);
    return target;
  }

  assetDirectory(projectId) {
    return path.join(this.projectRoot(projectId), 'assets');
  }

  normalizedPath(projectId) {
    return path.join(this.projectRoot(projectId), 'normalized-sources.json');
  }

  readNormalized(projectId) {
    const file = this.normalizedPath(projectId);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }

  async ingest(projectId, requests) {
    const cacheDir = path.join(this.root, '.cache');
    const assetOutputDir = this.assetDirectory(projectId);
    fs.mkdirSync(assetOutputDir, { recursive: true });
    const options = { cacheDir, assetOutputDir, assetUriPrefix: 'assets' };

    const added = [];
    for (const request of requests) {
      if (request.type === 'url') {
        // Each crawled page keeps its own URL as its label; the operator's
        // purpose and rights declaration apply to every page in the crawl.
        const sourceDefaults = {
          purpose: request.purpose,
          rightsStatus: request.rightsStatus,
          assetStatus: request.assetStatus,
          approvedForUse: request.approvedForUse,
        };
        added.push(...await normalizeWebsite(request.uri, { ...options, maxPages: request.maxPages, sourceDefaults }));
      } else {
        added.push(await normalizeSource({
          name: request.name,
          label: request.label,
          mimeType: request.mimeType,
          data: request.data,
          purpose: request.purpose,
          rightsStatus: request.rightsStatus,
          assetStatus: request.assetStatus,
          approvedForUse: request.approvedForUse,
          provenance: request.provenance ?? 'user-supplied',
        }, options));
      }
    }

    // Ingestion is additive: previously ingested material stays part of the
    // project's knowledge so a second upload does not silently discard the
    // first. Identical bytes from the same URI are ingested once.
    const merged = uniqueSources([...this.readNormalized(projectId), ...added]);
    const pack = assertKnowledgePack(buildKnowledgePack(merged));
    fs.writeFileSync(this.normalizedPath(projectId), `${JSON.stringify(merged, null, 2)}\n`);
    return { pack, added: added.map(sourceSummary), sourceCount: merged.length };
  }
}
