import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import Ajv from 'ajv';

const schemaPath = path.resolve('schemas/genuine-business-acceptance.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

function normalizedHost(value) {
  return value.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

function publicIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

function publicIpv6(host) {
  const value = host.toLowerCase();
  if (value === '::' || value === '::1' || value.startsWith('::ffff:')) return false;
  const first = value.split(':')[0];
  if (first.startsWith('fc') || first.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(first)) return false;
  return true;
}

export function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = normalizedHost(url.hostname);
    if (!host) return false;
    if (
      host === 'localhost'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || host.endsWith('.internal')
      || host.endsWith('.test')
      || host.endsWith('.invalid')
      || host.endsWith('.example')
      || ['example.com', 'example.net', 'example.org'].includes(host)
      || host.endsWith('.example.com')
      || host.endsWith('.example.net')
      || host.endsWith('.example.org')
    ) return false;
    const family = net.isIP(host);
    if (family === 4) return publicIpv4(host);
    if (family === 6) return publicIpv6(host);
    return host.includes('.');
  } catch {
    return false;
  }
}

function publicHost(value) {
  try {
    if (!isPublicHttpUrl(value)) return null;
    return normalizedHost(new URL(value).hostname);
  } catch {
    return null;
  }
}

function safeRelativePath(baseDir, value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) return null;
  const normalized = path.normalize(value);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) return null;
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function ajvErrors() {
  return (validateSchema.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`.trim());
}

function validateArtifactFile(baseDir, label, artifact, errors) {
  const resolved = safeRelativePath(baseDir, artifact.path);
  if (!resolved) {
    errors.push(`${label}.path must be a safe path relative to the evidence file`);
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    errors.push(`${label}.path does not resolve to a file`);
    return;
  }
  if (sha256File(resolved) !== artifact.sha256) errors.push(`${label}.sha256 does not match the referenced file`);
}

/**
 * Tie every declared source to the knowledge pack the run actually produced.
 *
 * Without this the gate could be satisfied by naming a website. The Phase 3.8E
 * nbm run proved it: an evidence file listing `https://www.nbm.bz/` as a
 * website source passed the validator even though the crawler had never
 * reached the site, because a website source needed no hash and nothing
 * connected the claim to an ingestion. A source that was never ingested cannot
 * appear in the pack, and the pack is already hashed and required here.
 */
function validateSourcesAgainstKnowledgePack(evidence, baseDir, errors) {
  const resolved = safeRelativePath(baseDir, evidence.artifacts.knowledgePack.path);
  if (!resolved || !fs.existsSync(resolved)) return; // already reported by validateArtifactFile
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch {
    errors.push('artifacts.knowledgePack must be readable JSON');
    return;
  }
  const packSources = Array.isArray(pack.sources) ? pack.sources : null;
  if (!packSources) {
    errors.push('artifacts.knowledgePack must record the sources this evidence claims were ingested');
    return;
  }
  const byHash = new Map(packSources.filter((source) => source.contentHash).map((source) => [source.contentHash, source]));
  for (const source of evidence.sources) {
    const ingested = byHash.get(source.sha256);
    if (!ingested) {
      errors.push(`source ${source.id} is not in the knowledge pack: nothing shows it was ingested`);
      continue;
    }
    if (source.kind === 'website') {
      const packHost = publicHost(ingested.uri ?? '');
      const declaredHost = publicHost(source.uri);
      if (!packHost || packHost !== declaredHost) {
        errors.push(`website source ${source.id} does not match the ingested page recorded in the knowledge pack`);
      }
    }
  }
}

const REVIEW_PLACEHOLDER = /\b(tbd|todo|n\/a|not issued|unresolved|pending|placeholder|lorem ipsum|xxx+)\b/i;

/**
 * A review is a judgement someone made, so it has to read like one.
 *
 * This cannot prove a person made it. It can refuse the cases where the file
 * says outright that nobody did.
 */
function validateProductReview(evidence, errors) {
  const { reviewer, notes } = evidence.productReview;
  if (REVIEW_PLACEHOLDER.test(reviewer)) errors.push('productReview.reviewer must name who reviewed it, not a placeholder');
  if (REVIEW_PLACEHOLDER.test(notes)) errors.push('productReview.notes must record what was judged, not a placeholder');
}

function validateArtifacts(evidence, evidenceFile, errors) {
  const baseDir = path.dirname(path.resolve(evidenceFile));
  validateArtifactFile(baseDir, 'artifacts.manifest', evidence.artifacts.manifest, errors);
  validateArtifactFile(baseDir, 'artifacts.knowledgePack', evidence.artifacts.knowledgePack, errors);
  validateArtifactFile(baseDir, 'artifacts.composition', evidence.artifacts.composition, errors);
  validateArtifactFile(baseDir, 'artifacts.verificationReport', evidence.artifacts.verificationReport, errors);

  const repository = safeRelativePath(baseDir, evidence.artifacts.generatedRepository.path);
  if (!repository || !fs.existsSync(repository) || !fs.statSync(repository).isDirectory()) {
    errors.push('artifacts.generatedRepository.path must resolve to a generated repository directory');
  } else if (!fs.existsSync(path.join(repository, 'package.json'))) {
    errors.push('artifacts.generatedRepository must contain package.json');
  }

  for (const source of evidence.sources) {
    if (source.provenance !== 'user-supplied' || !['document', 'logo', 'image', 'spreadsheet'].includes(source.kind)) continue;
    const resolved = safeRelativePath(baseDir, source.uri);
    if (!resolved) {
      errors.push(`user-supplied source ${source.id} must use a safe path relative to the evidence file`);
      continue;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      errors.push(`user-supplied source ${source.id} does not resolve to a file`);
      continue;
    }
    if (sha256File(resolved) !== source.sha256) errors.push(`user-supplied source ${source.id} sha256 does not match its file`);
  }
}

export function validateGenuineBusinessEvidence(evidence, { evidenceFile } = {}) {
  const errors = [];
  if (!validateSchema(evidence)) errors.push(...ajvErrors());
  if (errors.length) return errors;

  const primaryHost = publicHost(evidence.business.primaryUrl);
  if (!primaryHost) errors.push('business.primaryUrl must be a real public HTTP(S) URL, not an example/local/private host');

  const websiteSources = evidence.sources.filter((source) => source.kind === 'website' && isPublicHttpUrl(source.uri));
  if (!websiteSources.length) errors.push('sources must include at least one real public website source');
  if (primaryHost && !websiteSources.some((source) => publicHost(source.uri) === primaryHost)) {
    errors.push('sources must include the business primary website itself');
  }

  const ids = new Set();
  for (const source of evidence.sources) {
    if (ids.has(source.id)) errors.push(`source id ${source.id} is duplicated`);
    ids.add(source.id);
    if (source.kind === 'website' && !isPublicHttpUrl(source.uri)) errors.push(`website source ${source.id} is not a real public URL`);
  }

  const suppliedMaterial = evidence.sources.filter((source) =>
    ['document', 'logo', 'image', 'spreadsheet'].includes(source.kind)
    && source.provenance === 'user-supplied'
    && source.rightsStatus === 'approved-for-use');
  if (!suppliedMaterial.length) {
    errors.push('sources must include at least one user-supplied document/logo/image/spreadsheet approved for use');
  }
  for (const source of evidence.sources) {
    if (!source.sha256) errors.push(`source ${source.id} must record the sha256 of what was ingested`);
  }

  if (evidence.manualEdits.total !== evidence.manualEdits.entries.length) {
    errors.push('manualEdits.total must equal the number of meaningful edit entries');
  }
  if (evidence.manualEdits.total >= evidence.manualEdits.targetMaximum) {
    errors.push(`manualEdits.total must be fewer than ${evidence.manualEdits.targetMaximum}`);
  }

  const startedAt = Date.parse(evidence.run.startedAt);
  const completedAt = Date.parse(evidence.run.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    errors.push('run.startedAt/completedAt must be valid chronological timestamps');
  }

  validateProductReview(evidence, errors);

  if (evidenceFile) {
    validateArtifacts(evidence, evidenceFile, errors);
    validateSourcesAgainstKnowledgePack(evidence, path.dirname(path.resolve(evidenceFile)), errors);
  }
  return errors;
}

export function assertGenuineBusinessEvidence(evidence, options) {
  const errors = validateGenuineBusinessEvidence(evidence, options);
  if (errors.length) throw new Error(`Genuine business acceptance evidence failed:\n- ${errors.join('\n- ')}`);
  return evidence;
}
