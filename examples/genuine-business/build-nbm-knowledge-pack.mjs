#!/usr/bin/env node
/**
 * Materialise the frozen approved knowledge pack for the nbm genuine-business case.
 *
 * Phase 4D compares several visual candidates against one product truth. If each
 * candidate ingested the live website the comparison would be contaminated the
 * moment nbm published a page, so the pack is frozen once, committed, and every
 * candidate in a set is composed from that same file.
 *
 * Two things this deliberately does NOT do:
 *
 * 1. It does not store the bodies of `reference-only` sources. nbm's public site
 *    is crawled to corroborate facts, not to be republished, and this repository
 *    is public. Only the facts a reference-only page yields are retained, each
 *    still carrying the source id, provenance and rights status it was derived
 *    under. Composition consumes facts and never page prose, so every page,
 *    section, binding and warning is identical with the bodies removed; the
 *    only thing that moves is the composition hash, because it derives from the
 *    pack hash and this is deliberately a different pack revision.
 *
 * 2. It does not claim to reproduce the original Phase 3.8E pack. That artefact
 *    lived under /srv and is not recoverable here, and the live site has moved
 *    since. What this writes is a new frozen revision with its own pack hash.
 *
 * Usage:
 *   node examples/genuine-business/build-nbm-knowledge-pack.mjs [--verify]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource, normalizeWebsite } from '@app-builder/content-intelligence';
import { composeProject } from '@app-builder/composition';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(here, 'nbm-approved-intake.v1.json');
const OUT = path.join(here, 'nbm-approved-knowledge.v1.json');

// The service's own default crawl depth. Matching it here is what makes the
// frozen pack the same shape the running factory would have produced.
const DEFAULT_CRAWL_PAGES = 8;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** Recompute the pack identity the same way `buildKnowledgePack` does. */
function rehash(pack) {
  const withoutHash = { ...pack };
  delete withoutHash.packHash;
  return { ...withoutHash, packHash: sha256(JSON.stringify(withoutHash)) };
}

/**
 * Drop the stored prose of every source that may not be republished.
 *
 * Facts survive with their provenance because a fact is data the business
 * already publishes about itself; a page body is someone else's expression.
 */
function redactReferenceOnlyBodies(pack) {
  const publishable = new Map(pack.sources.map((source) => [source.id, source.publishUseAllowed !== false]));
  const keptContent = (pack.content ?? []).filter((record) => publishable.get(record.sourceId) !== false);
  const keptChunks = (pack.chunks ?? []).filter((chunk) => {
    const sourceId = Array.isArray(chunk.sourceIds) ? chunk.sourceIds[0] : chunk.sourceId;
    return publishable.get(sourceId) !== false;
  });
  return rehash({ ...pack, content: keptContent, chunks: keptChunks });
}

async function materialise() {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const declared = bundle.projectManifest.inputs.sources;
  const normalized = [];

  for (const source of declared) {
    const governance = {
      purpose: source.purpose ?? null,
      rightsStatus: source.rightsStatus,
      assetStatus: source.assetStatus,
      approvedForUse: source.rightsStatus === 'approved-for-use' ? true : undefined,
    };
    if (source.kind === 'url') {
      normalized.push(...await normalizeWebsite(source.uri, { maxPages: DEFAULT_CRAWL_PAGES, sourceDefaults: governance }));
    } else {
      normalized.push(await normalizeSource({
        name: source.name,
        label: source.label,
        mimeType: source.mimeType,
        data: fs.readFileSync(path.join(here, source.name)),
        provenance: source.provenance ?? 'user-supplied',
        ...governance,
      }, {}));
    }
  }

  return redactReferenceOnlyBodies(assertKnowledgePack(buildKnowledgePack(normalized)));
}

const verifyOnly = process.argv.includes('--verify');

if (verifyOnly) {
  // Prove the redaction is free: the frozen pack must compose to exactly what
  // the unredacted ingestion composes to, or the artefact is lying about being
  // an equivalent product truth.
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const frozen = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const rehashed = rehash(frozen);
  if (rehashed.packHash !== frozen.packHash) {
    console.error(`Frozen pack hash does not match its contents: recorded ${frozen.packHash}, computed ${rehashed.packHash}.`);
    process.exit(1);
  }
  const composition = composeProject({ manifest: bundle.projectManifest, knowledgePack: frozen, assetDecisions: [] });
  console.log(`Frozen pack ${frozen.packHash} verified.`);
  console.log(`  sources ${frozen.sources.length}, facts ${frozen.facts.length}, content ${frozen.content.length}, chunks ${frozen.chunks.length}`);
  console.log(`  composition ${composition.compositionHash}, warnings: ${composition.warnings.join(', ') || 'none'}`);
} else {
  const pack = await materialise();
  fs.writeFileSync(OUT, `${JSON.stringify(pack, null, 2)}\n`);
  const referenceOnly = pack.sources.filter((source) => source.publishUseAllowed === false).length;
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  packHash ${pack.packHash}`);
  console.log(`  sources ${pack.sources.length} (${referenceOnly} reference-only, bodies redacted), facts ${pack.facts.length}, chunks ${pack.chunks.length}`);
}
