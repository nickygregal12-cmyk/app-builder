/**
 * Candidate Truth Readiness.
 *
 * The candidate lane must judge the product the factory would really build, so
 * it refuses to mint candidates over a starved product truth. The first version
 * of that guard asked one question — "does the manifest declare any source?" —
 * and that predicate is too coarse to be true of more than one business.
 *
 * NBM declares an owner-approved acceptance workbook. Composing from bare
 * manifest values while that workbook sits unread is the historical defect, and
 * it must keep failing.
 *
 * MGB declares six sources and not one of them is material in that sense. Three
 * are social and register URLs supplied as places to look, explicitly
 * `reference-only` with `publishUseAllowed: false`. Three are a logo and two
 * photographs whose *rights* the owner granted and whose *bytes* never arrived.
 * A source probe over all six returns nothing, because there is nothing there to
 * return. Under the count predicate MGB could only generate candidates by being
 * handed an empty knowledge pack — a pack that adds no truth and exists solely
 * to satisfy the shape of the check. That is worse than the refusal.
 *
 * So the distinction this module draws is semantic:
 *
 *   material source        content the run was expected to read. Not reading it
 *                          starves the truth, and candidates are refused.
 *   research location      a URL supplied as an identifier. A place to look is
 *                          not a fact, and never becomes required content.
 *   asset right, no bytes  rights recorded over a file that was never supplied.
 *                          An asset gap, not missing product truth.
 *   approved intake fact   a fact the owner supplied through intake. Legitimate
 *                          frozen truth even where nothing external verifies it.
 *   knowledge pack         the strongest, replayable, source-backed case.
 *
 * Nothing here decides rights or ingests anything. It reads answers that source
 * governance already recorded on each declared source and reports what they mean
 * for one decision: may this run mint candidates, and what is a reviewer looking
 * at when it does.
 */

const list = (value) => (Array.isArray(value) ? value : []);

/** Kinds that carry product truth as text, and are therefore expected to be read. */
const CONTENT_BEARING_KINDS = Object.freeze(['url', 'document', 'spreadsheet', 'database-api', 'other']);

/** Kinds that carry a picture. Their absence is an asset gap, not a starved truth. */
const ASSET_KINDS = Object.freeze(['logo', 'image', 'screenshot']);

/**
 * The role that means "a place to look".
 *
 * `research` is the intake's own word for a source supplied as an identifier
 * rather than as content. It is the field that separates MGB's Facebook page
 * from NBM's workbook, and it was already there.
 */
const RESEARCH_ROLE = 'research';

/** Per-source states, in the order a reader should think about them. */
export const TRUTH_STATES = Object.freeze([
  'material-ingested',
  'material-unread',
  'reference-only-research',
  'asset-right-without-bytes',
  'asset-ingested',
  'withheld',
]);

function isContentBearing(source) {
  return CONTENT_BEARING_KINDS.includes(source.kind);
}

function isAsset(source) {
  return ASSET_KINDS.includes(source.kind);
}

/**
 * Which declared sources the run was actually expected to read.
 *
 * A source is material when it carries text, was not supplied merely as a
 * research location, and the business cleared it for use. Everything excluded
 * here is excluded because of something the owner said, not because it was
 * convenient.
 */
function isMaterial(source) {
  if (!isContentBearing(source)) return false;
  if (source.sourceRole === RESEARCH_ROLE) return false;
  return source.rightsStatus === 'approved-for-use';
}

function classifySource(source, ingestedChannels) {
  const base = {
    id: source.id,
    kind: source.kind,
    label: source.label,
    sourceRole: source.sourceRole ?? null,
    rightsStatus: source.rightsStatus ?? null,
    sourceChannel: source.sourceChannel ?? null,
    publishUseAllowed: source.publishUseAllowed === true,
    uri: source.uri ?? null,
  };

  if (isAsset(source)) {
    // Rights over a file are not the file. The owner approving prototype use of
    // a logo that was never handed over leaves an asset outstanding, and asset
    // readiness already knows what to do about that: pick a direction that does
    // not need the photograph.
    if (ingestedChannels.has(source.sourceChannel)) return { ...base, state: 'asset-ingested', reason: 'Bytes were ingested for this channel.' };
    if (source.rightsStatus === 'approved-for-use') {
      return { ...base, state: 'asset-right-without-bytes', reason: 'Approved for use, but no bytes were ever supplied, so nothing was ingested and nothing is publishable.' };
    }
    return { ...base, state: 'withheld', reason: `Rights are ${source.rightsStatus ?? 'unrecorded'}, so this asset cannot be used.` };
  }

  if (source.sourceRole === RESEARCH_ROLE) {
    // A URL the owner supplied so the factory knows where to look. Whether it
    // yielded anything is a separate question; not yielding anything must never
    // promote it into required content.
    return { ...base, state: 'reference-only-research', reason: 'Supplied as a place to research, not as content. No fact is asserted from it unless one was ingested and attributed.' };
  }

  if (!isMaterial(source)) {
    return { ...base, state: 'withheld', reason: `Rights are ${source.rightsStatus ?? 'unrecorded'}, so this source was not read.` };
  }

  return ingestedChannels.has(source.sourceChannel)
    ? { ...base, state: 'material-ingested', reason: 'Material content was ingested on this source channel.' }
    : { ...base, state: 'material-unread', reason: 'Material content the run was expected to read, and no ingested material arrived on its channel.' };
}

/**
 * Which channels the pack actually brought truth in on.
 *
 * Coverage is measured per `sourceChannel` rather than per source id, because
 * declared ids and pack ids are deliberately not the same identity: ingestion
 * re-mints an id from the content hash, and a single declared website fans out
 * into one pack source per crawled page. Matching them back would need a
 * provenance ledger this repository does not have and does not need.
 *
 * A pack source counts only if it contributed at least one fact, content record
 * or chunk. That is what stops the obvious way around this guard — freezing an
 * empty pack so the run looks source-backed while composing from exactly the
 * same bare manifest values as before.
 */
function ingestedContentChannels(knowledgePack) {
  const channels = new Set();
  if (!knowledgePack) return channels;
  const facts = list(knowledgePack.facts);
  const content = list(knowledgePack.content);
  const chunks = list(knowledgePack.chunks);

  for (const source of list(knowledgePack.sources)) {
    const contributed = facts.some((fact) => fact.sourceId === source.id)
      || content.some((record) => record.sourceId === source.id)
      || chunks.some((chunk) => list(chunk.sourceIds).includes(source.id) || chunk.sourceId === source.id);
    if (!contributed) continue;
    if (isAsset(source)) {
      channels.add(source.sourceChannel);
      continue;
    }
    if (!isContentBearing(source)) continue;
    channels.add(source.sourceChannel);
  }
  return channels;
}

/**
 * Classify what a candidate run would be judged against.
 *
 * `readyForCandidates` is the field with a consumer: the factory refuses
 * generation when it is false. Everything else is the evidence a reviewer needs
 * to know what they are looking at — above all, that approved intake facts are
 * not externally verified facts and must never be reported as though they were.
 */
export function classifyCandidateTruthReadiness({ sources = [], knowledgePack = null } = {}) {
  const declared = list(sources);
  const ingestedChannels = ingestedContentChannels(knowledgePack);
  const classified = declared.map((source) => classifySource(source, ingestedChannels));

  const unread = classified.filter((entry) => entry.state === 'material-unread');
  const material = classified.filter((entry) => entry.state === 'material-unread' || entry.state === 'material-ingested');
  const referenceOnly = classified.filter((entry) => entry.state === 'reference-only-research');
  const assetGaps = classified.filter((entry) => entry.state === 'asset-right-without-bytes');

  const status = !declared.length
    ? 'no-declared-sources'
    : unread.length
      ? 'material-source-unread'
      : material.length
        ? 'ingested-knowledge-pack'
        : 'approved-intake-truth-with-source-gaps';

  return {
    schemaVersion: 1,
    authority: 'source-governance',
    status,
    readyForCandidates: status !== 'material-source-unread',
    // Named rather than counted, so a refusal can say which source went unread
    // and a review can say which asset is still outstanding.
    classified,
    material: material.map((entry) => entry.id),
    unread: unread.map((entry) => entry.id),
    referenceOnlyResearch: referenceOnly.map((entry) => entry.id),
    assetRightsWithoutBytes: assetGaps.map((entry) => entry.id),
    knowledgePackHash: knowledgePack?.packHash ?? null,
    ingestedContentChannels: [...ingestedChannels].filter(Boolean).sort(),
    coverageBasis: 'ingested-content-per-source-channel',
    truthBasis: describeTruthBasis({ status, referenceOnly, assetGaps, knowledgePack, ingestedChannels }),
    refusal: unread.length ? describeRefusal(unread) : null,
  };
}

/**
 * What a reviewer is judging, in the words that are true of it.
 *
 * MGB's candidates are composed from facts its owner approved, with three
 * research locations nobody read and three assets nobody supplied. That is a
 * legitimate basis for a prototype and an illegitimate thing to call verified.
 * Saying so here means the packet cannot quietly overstate itself later.
 */
function describeTruthBasis({ status, referenceOnly, assetGaps, knowledgePack, ingestedChannels }) {
  const notes = [];
  if (status === 'approved-intake-truth-with-source-gaps' || status === 'no-declared-sources') {
    notes.push('Product truth is owner-approved intake, not externally verified fact.');
  }
  // A pack that was handed over but contributed nothing is the case this note
  // must not flatter. "A pack exists" and "material arrived" are two facts, and
  // only the second one backs a truth.
  if (ingestedChannels.size) notes.push('An ingested knowledge pack contributed source-backed material.');
  else if (knowledgePack) notes.push('A knowledge pack was supplied but contributed no fact, content or chunk, so no external material backs this truth.');
  else notes.push('No knowledge pack was ingested, so no external material backs this truth.');
  if (referenceOnly.length) notes.push(`${referenceOnly.length} external ${referenceOnly.length === 1 ? 'location was' : 'locations were'} supplied for research only; no fact is asserted from ${referenceOnly.length === 1 ? 'it' : 'them'}.`);
  if (assetGaps.length) notes.push(`${assetGaps.length} approved ${assetGaps.length === 1 ? 'asset has' : 'assets have'} no supplied bytes, so nothing derived from ${assetGaps.length === 1 ? 'it' : 'them'} is publishable.`);
  return { summary: status, notes };
}

function describeRefusal(unread) {
  const named = unread.map((entry) => `${entry.id} (${entry.kind}, ${entry.sourceRole ?? 'no role'})`).join(', ');
  return `${unread.length} material source(s) declared and unread: ${named}. `
    + 'Replay the intake bundle with its frozen knowledge pack, or ingest the declared sources, before generating candidates.';
}
