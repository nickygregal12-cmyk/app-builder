/**
 * Design references as a durable project input.
 *
 * The lane this file owns is narrow and it matters that it stays narrow. A
 * design reference is neither a source nor an asset:
 *
 *   company truth        -> KnowledgePack        (facts, with provenance)
 *   market research      -> research evidence    (about a market, not a look)
 *   design references    -> here                 (about appearance only)
 *
 * That separation is the whole reason this is a separate store rather than
 * another `kind` on the source list. A source can be approved for use, become a
 * fact, appear in generated copy and end up as a published asset. A reference
 * must never do any of those things, and the cheapest way to guarantee it is to
 * keep it somewhere the ingestion path cannot reach. `assertReferenceIsNotContent`
 * runs on every write, and the knowledge guard test proves an architecture
 * studio's service list cannot become a plumber's.
 *
 * A reference influences nothing until a person approves its traits. Capture is
 * cheap and reversible; changing what a build looks like is neither.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertContract } from '@app-builder/contracts';
import {
  assertReferenceIsNotContent,
  buildReferenceAnalysis,
  loadReferenceTraits,
  referenceTraitCatalogue,
  resolveReferenceInfluence,
} from '../../../tooling/lib/visual-reference.mjs';
import { captureReference } from '../../../tooling/lib/visual-reference-capture.mjs';

export const REFERENCE_LIMITS = Object.freeze({
  maxReferencesPerProject: 8,
  maxScreenshotBytes: 8 * 1024 * 1024,
});

const SCREENSHOT_MIMES = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
});

const list = (value) => (Array.isArray(value) ? value : []);

function referencesRoot(service, projectId) {
  return path.join(service.ingestion.projectRoot(projectId), 'design-references');
}

function referenceDirectory(service, projectId, referenceId) {
  // The identifier reaches this from an HTTP path segment, so it is resolved
  // and re-checked rather than trusted to stay inside its own project.
  const base = path.resolve(referencesRoot(service, projectId));
  const target = path.resolve(base, referenceId);
  if (target === base || !target.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe design reference directory: ${referenceId}`);
  return target;
}

export function listDesignReferences(service, projectId) {
  service.requireProject(projectId);
  const root = referencesRoot(service, projectId);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((entry) => path.join(root, entry, 'analysis.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function readDesignReference(service, projectId, referenceId) {
  const file = path.join(referenceDirectory(service, projectId, referenceId), 'analysis.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function writeAnalysis(service, projectId, analysis) {
  const traitRegistry = loadReferenceTraits(service.factoryRoot);
  assertReferenceIsNotContent(analysis, traitRegistry);
  const document = assertContract('visual-reference-analysis', analysis);
  const directory = referenceDirectory(service, projectId, document.referenceId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'analysis.json'), `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

/**
 * Read a supplied image's own dimensions from its header.
 *
 * Deliberately a header read rather than a decode. What a screenshot can honestly
 * contribute is what the person says about it: nothing here pretends to see
 * typography or spacing in a picture, because it cannot, and a trait with a
 * fabricated measurement behind it is worse than no trait. The dimensions are
 * recorded because they are a real measurement of the supplied file and because
 * a reviewer should be able to see that a "moodboard" was a 320px thumbnail.
 */
export function imageDimensions(buffer) {
  if (buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function screenshotObservations(buffer) {
  const size = imageDimensions(buffer);
  if (!size) return null;
  return {
    typography: [],
    layout: [],
    spacing: [],
    colour: [],
    imagery: [
      { id: 'imagery-supplied-width', measure: 'supplied-image-width-px', value: size.width, unit: 'px', viewport: null, detail: null },
      { id: 'imagery-supplied-height', measure: 'supplied-image-height-px', value: size.height, unit: 'px', viewport: null, detail: null },
    ],
    motion: [],
    navigation: [],
    responsive: [],
  };
}

function intentFrom(input = {}) {
  return {
    preference: input.preference ?? 'like',
    influence: input.influence ?? 'medium',
    useFor: list(input.useFor).map(String),
    liked: list(input.liked).map(String),
    disliked: list(input.disliked).map(String),
    note: input.note ? String(input.note) : null,
  };
}

/**
 * Add one reference and analyse it.
 *
 * The capture runs before the analysis is assembled, and a capture that could
 * not happen is not an error: a host with no browser still gets a usable
 * reference built from what the person said, marked `createdFromEvidence: false`
 * so nobody mistakes a description for a measurement.
 */
export async function addDesignReference(service, projectId, request = {}, options = {}) {
  service.requireProject(projectId);
  const existing = listDesignReferences(service, projectId);
  if (existing.length >= REFERENCE_LIMITS.maxReferencesPerProject) {
    throw new Error(`A project may carry at most ${REFERENCE_LIMITS.maxReferencesPerProject} design references. Remove one before adding another.`);
  }
  const traitRegistry = loadReferenceTraits(service.factoryRoot);
  const createdAt = options.now ?? new Date().toISOString();
  const userIntent = intentFrom(request);

  let sourceRef;
  let observed = null;
  let capture = null;
  let evidenceHash = null;
  let files = [];

  if (request.url) {
    const result = await captureReference(String(request.url), { ...options.capture, env: options.env ?? process.env });
    sourceRef = {
      kind: 'url',
      label: request.label ? String(request.label) : String(request.url),
      requestedUrl: String(request.url),
      canonicalUrl: result.canonicalUrl,
      fileName: null,
      mimeType: null,
      byteSize: null,
    };
    observed = result.observed;
    capture = {
      capturedAt: result.capturedAt,
      status: result.status,
      unavailableReason: result.unavailableReason,
      // What the page asked the trusted browser to reach and the boundary
      // refused. Empty is the ordinary case; anything in it is worth a look.
      blockedRequests: list(result.blockedRequests),
      viewports: result.viewports,
    };
    files = list(result.screenshots).map((shot) => ({ name: `${shot.viewport}.png`, bytes: shot.bytes }));
    evidenceHash = result.viewports.length
      ? createHash('sha256').update(result.viewports.map((viewport) => viewport.contentHash).join(':')).digest('hex')
      : null;
  } else if (request.contentBase64) {
    const mimeType = String(request.mimeType ?? 'image/png').toLowerCase();
    const extension = SCREENSHOT_MIMES[mimeType];
    if (!extension) throw new Error(`A screenshot reference must be one of: ${Object.keys(SCREENSHOT_MIMES).join(', ')}.`);
    const bytes = Buffer.from(String(request.contentBase64), 'base64');
    if (!bytes.length) throw new Error('The supplied screenshot decoded to zero bytes.');
    if (bytes.length > REFERENCE_LIMITS.maxScreenshotBytes) {
      throw new Error(`A screenshot reference may be at most ${Math.round(REFERENCE_LIMITS.maxScreenshotBytes / (1024 * 1024))} MB.`);
    }
    sourceRef = {
      kind: 'screenshot',
      label: request.label ? String(request.label) : String(request.name ?? 'Screenshot'),
      requestedUrl: null,
      canonicalUrl: null,
      fileName: `reference${extension}`,
      mimeType,
      byteSize: bytes.length,
    };
    observed = screenshotObservations(bytes);
    evidenceHash = createHash('sha256').update(bytes).digest('hex');
    files = [{ name: `reference${extension}`, bytes }];
  } else {
    throw new Error('A design reference needs either a url or an uploaded image.');
  }

  const analysis = buildReferenceAnalysis({ projectId, sourceRef, observed, capture, evidenceHash, userIntent, traitRegistry, createdAt });
  const directory = referenceDirectory(service, projectId, analysis.referenceId);
  fs.mkdirSync(directory, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(directory, file.name), file.bytes);
  const stored = writeAnalysis(service, projectId, analysis);

  await service.recordOperationalEvent(projectId, 'design.reference.added', {
    referenceId: stored.referenceId,
    kind: stored.sourceRef.kind,
    captureStatus: stored.capture?.status ?? 'not-applicable',
    blockedRequests: list(stored.capture?.blockedRequests).map((entry) => `${entry.resourceType}:${entry.host ?? 'n/a'}`),
    createdFromEvidence: stored.createdFromEvidence,
    adopt: stored.adopt.map((trait) => trait.trait),
    avoid: stored.avoid.map((trait) => trait.trait),
  });
  return stored;
}

/**
 * Re-resolve one reference's traits after a person edited what they meant.
 *
 * The observations are untouched: a person may change what they want from a
 * page, never what the page turned out to be. That is the same separation the
 * analysis records, enforced at the one place it could be violated.
 */
export async function updateDesignReferenceIntent(service, projectId, referenceId, intent = {}) {
  const current = readDesignReference(service, projectId, referenceId);
  if (!current) throw new Error(`No design reference ${referenceId} on this project.`);
  const traitRegistry = loadReferenceTraits(service.factoryRoot);
  const next = buildReferenceAnalysis({
    projectId,
    sourceRef: current.sourceRef,
    observed: current.observed,
    capture: current.capture,
    evidenceHash: current.evidenceHash,
    userIntent: intentFrom({ ...current.userIntent, ...intent }),
    traitRegistry,
    createdAt: current.createdAt,
    rationale: current.rationale,
  });
  // Editing what a reference is for returns it to draft. A build must not
  // silently inherit traits nobody approved in their current form.
  const stored = writeAnalysis(service, projectId, { ...next, referenceId: current.referenceId, approval: { state: 'draft', approvedBy: null, approvedAt: null } });
  await service.recordOperationalEvent(projectId, 'design.reference.updated', {
    referenceId: stored.referenceId,
    adopt: stored.adopt.map((trait) => trait.trait),
    avoid: stored.avoid.map((trait) => trait.trait),
    approval: stored.approval.state,
  });
  return stored;
}

export const REFERENCE_APPROVAL_STATES = Object.freeze(['draft', 'approved', 'disabled']);

export async function setDesignReferenceApproval(service, projectId, referenceId, { state, approvedBy = 'console', now = new Date().toISOString() } = {}) {
  if (!REFERENCE_APPROVAL_STATES.includes(state)) {
    throw new Error(`Unknown design-reference approval state: ${String(state)}. It offers: ${REFERENCE_APPROVAL_STATES.join(', ')}.`);
  }
  const current = readDesignReference(service, projectId, referenceId);
  if (!current) throw new Error(`No design reference ${referenceId} on this project.`);
  if (state === 'approved' && !current.adopt.length && !current.avoid.length) {
    throw new Error(`Design reference ${referenceId} carries no traits to approve. Say what you like or dislike about it first.`);
  }
  const stored = writeAnalysis(service, projectId, {
    ...current,
    approval: state === 'approved' ? { state, approvedBy, approvedAt: now } : { state, approvedBy: null, approvedAt: null },
  });
  await service.recordOperationalEvent(projectId, 'design.reference.approval.updated', {
    referenceId,
    state,
    adopt: stored.adopt.map((trait) => trait.trait),
    avoid: stored.avoid.map((trait) => trait.trait),
  });
  return stored;
}

export async function removeDesignReference(service, projectId, referenceId) {
  const current = readDesignReference(service, projectId, referenceId);
  if (!current) throw new Error(`No design reference ${referenceId} on this project.`);
  fs.rmSync(referenceDirectory(service, projectId, referenceId), { recursive: true, force: true });
  await service.recordOperationalEvent(projectId, 'design.reference.removed', { referenceId });
  return { removed: referenceId };
}

/** One capture's bytes, addressed by the file the analysis recorded. */
export function readDesignReferenceCapture(service, projectId, referenceId, fileName) {
  const analysis = readDesignReference(service, projectId, referenceId);
  if (!analysis) return null;
  const known = [
    ...list(analysis.capture?.viewports).map((viewport) => viewport.file),
    analysis.sourceRef.fileName,
  ].filter(Boolean);
  if (!known.includes(fileName)) return null;
  const file = path.join(referenceDirectory(service, projectId, referenceId), fileName);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/**
 * What the approved references, taken together, ask of this project's design.
 *
 * This is the one value the art-direction path reads. Everything else in this
 * file exists to make it trustworthy.
 */
export function designReferenceInfluence(service, projectId) {
  const traitRegistry = loadReferenceTraits(service.factoryRoot);
  return resolveReferenceInfluence(listDesignReferences(service, projectId), traitRegistry);
}

/** The reference panel's whole state, in one read. */
export function designReferenceSummary(service, projectId) {
  const references = listDesignReferences(service, projectId);
  const traitRegistry = loadReferenceTraits(service.factoryRoot);
  return {
    references,
    influence: resolveReferenceInfluence(references, traitRegistry),
    catalogue: referenceTraitCatalogue(traitRegistry),
    useFor: [...(traitRegistry.useFor ?? [])],
    limits: { ...REFERENCE_LIMITS },
  };
}
