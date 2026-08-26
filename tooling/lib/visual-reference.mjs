/**
 * Design references — what a site somebody likes is allowed to contribute.
 *
 * The product problem this exists for is small to say and easy to get wrong:
 *
 *   "I like Site A for its typography and spacing. I like Site B for its
 *    motion. Don't copy either. Avoid Site B's dark palette."
 *
 * Getting it wrong looks like one of two failures. Either the reference becomes
 * a template — source markup, source copy, source photographs — which is theft
 * wearing an automation costume; or it becomes metadata, a decorated record of
 * a page nobody's build was changed by.
 *
 * The shape that avoids both is a narrow channel. A capture measures a page. A
 * measurement becomes a trait only if the trait is in `config/visual-reference-traits.json`
 * and only if a named measurement supports it. A trait reaches a build only
 * through `adopt` and `avoid`, and only after a person approved it. Nothing
 * else crosses.
 *
 * Three things stay separate the whole way through, because collapsing them is
 * how a system starts inventing observations:
 *
 *   observed     — what the browser measured. Numbers and enumerations.
 *   interpreted  — what the factory concluded, with the measurements named.
 *   userIntent   — what the person said, in their own words and choices.
 *
 * `adopt`/`avoid` are the resolved product of the last two. A reviewer reading
 * an analysis can always answer "did the factory see this, or decide it, or was
 * it told it?", which is the question a fabricated observation cannot survive.
 *
 * What is deliberately NOT here: any path from a reference to text, an image,
 * a colour value, a font file, a component or a route. `assertReferenceIsNotContent`
 * is the executable form of that, and it is asserted on write rather than
 * trusted to whoever assembled the record.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const VISUAL_REFERENCE_TRAITS_PATH = 'config/visual-reference-traits.json';

export const REFERENCE_PREFERENCES = Object.freeze(['like', 'dislike', 'mixed']);
export const REFERENCE_INFLUENCES = Object.freeze(['low', 'medium', 'strong']);
export const CONFIDENCES = Object.freeze(['low', 'medium', 'high']);
export const OBSERVATION_CATEGORIES = Object.freeze(['typography', 'layout', 'spacing', 'colour', 'imagery', 'motion', 'navigation', 'responsive']);

const INFLUENCE_RANK = Object.freeze({ low: 0, medium: 1, strong: 2 });
const CONFIDENCE_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });

const list = (value) => (Array.isArray(value) ? value : []);

export function loadReferenceTraits(factoryRoot = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(factoryRoot, VISUAL_REFERENCE_TRAITS_PATH), 'utf8'));
}

export function referenceId(seed) {
  return `reference-${createHash('sha256').update(typeof seed === 'string' ? seed : JSON.stringify(seed)).digest('hex').slice(0, 16)}`;
}

/**
 * Every measurement the interpreter knows how to read, and the trait it can
 * support.
 *
 * A rule is a function of the observation map so a threshold is stated once,
 * beside the trait it justifies, rather than spread through a switch. A
 * measurement the capture did not produce simply yields nothing: a reference
 * captured from a page with no navigation says nothing about navigation, which
 * is a better answer than a default.
 */
const INTERPRETATION_RULES = Object.freeze([
  {
    trait: 'oversized-display-type',
    reads: ['typography.display-font-size-px'],
    decide: (value) => (value >= 72 ? 'high' : value >= 56 ? 'medium' : null),
    detail: (value) => `The largest heading is set at ${Math.round(value)}px.`,
  },
  {
    trait: 'restrained-display-type',
    reads: ['typography.display-font-size-px'],
    decide: (value) => (value <= 28 ? 'high' : value <= 34 ? 'medium' : null),
    detail: (value) => `The largest heading is set at ${Math.round(value)}px.`,
  },
  {
    trait: 'narrow-reading-measure',
    reads: ['typography.reading-measure-px'],
    decide: (value) => (value <= 640 ? 'high' : value <= 720 ? 'medium' : null),
    detail: (value) => `Body text is set in a ${Math.round(value)}px column.`,
  },
  {
    trait: 'generous-whitespace',
    reads: ['spacing.section-gap-median-px'],
    decide: (value) => (value >= 128 ? 'high' : value >= 96 ? 'medium' : null),
    detail: (value) => `Sections sit ${Math.round(value)}px apart.`,
  },
  {
    trait: 'dense-information',
    reads: ['spacing.section-gap-median-px'],
    decide: (value) => (value <= 32 ? 'high' : value <= 48 ? 'medium' : null),
    detail: (value) => `Sections sit ${Math.round(value)}px apart.`,
  },
  {
    trait: 'wide-canvas',
    reads: ['layout.container-max-width-px'],
    decide: (value) => (value >= 1600 ? 'high' : value >= 1400 ? 'medium' : null),
    detail: (value) => `The main container runs to ${Math.round(value)}px.`,
  },
  {
    trait: 'asymmetric-composition',
    reads: ['layout.grid-asymmetric'],
    decide: (value) => (value === true ? 'medium' : null),
    detail: () => 'At least one item grid uses columns of unequal width.',
  },
  {
    trait: 'symmetric-grid',
    reads: ['layout.grid-asymmetric', 'layout.grid-count'],
    decide: (asymmetric, count) => (asymmetric === false && Number(count) > 0 ? 'medium' : null),
    detail: (_asymmetric, count) => `${count} item grid(s), all in equal columns.`,
  },
  {
    trait: 'imagery-led-opening',
    reads: ['layout.hero-media-ratio'],
    decide: (value) => (value >= 0.6 ? 'high' : value >= 0.4 ? 'medium' : null),
    detail: (value) => `Media covers ${Math.round(value * 100)}% of the opening.`,
  },
  {
    trait: 'typographic-opening',
    reads: ['layout.hero-media-ratio'],
    decide: (value) => (value === 0 ? 'high' : value <= 0.1 ? 'medium' : null),
    detail: (value) => (value === 0 ? 'The opening carries no image or video.' : `Media covers only ${Math.round(value * 100)}% of the opening.`),
  },
  {
    trait: 'alternating-section-ground',
    reads: ['colour.distinct-section-backgrounds'],
    decide: (value) => (value >= 3 ? 'high' : value === 2 ? 'medium' : null),
    detail: (value) => `${value} distinct section grounds down the page.`,
  },
  {
    trait: 'single-ground',
    reads: ['colour.distinct-section-backgrounds'],
    decide: (value) => (value <= 1 ? 'high' : null),
    detail: () => 'Every section sits on the same ground.',
  },
  {
    trait: 'dark-ground',
    reads: ['colour.background-luminance'],
    decide: (value) => (value <= 0.15 ? 'high' : value <= 0.3 ? 'medium' : null),
    detail: (value) => `The page ground has a relative luminance of ${value.toFixed(2)}.`,
  },
  {
    trait: 'light-ground',
    reads: ['colour.background-luminance'],
    decide: (value) => (value >= 0.85 ? 'high' : value >= 0.7 ? 'medium' : null),
    detail: (value) => `The page ground has a relative luminance of ${value.toFixed(2)}.`,
  },
  {
    trait: 'ruled-section-headings',
    reads: ['typography.ruled-heading-count'],
    decide: (value) => (value >= 3 ? 'high' : value >= 1 ? 'medium' : null),
    detail: (value) => `${value} section heading(s) carry a rule.`,
  },
  {
    trait: 'plain-section-headings',
    reads: ['typography.ruled-heading-count', 'typography.heading-count'],
    decide: (ruled, headings) => (ruled === 0 && Number(headings) >= 2 ? 'medium' : null),
    detail: (_ruled, headings) => `None of the ${headings} section headings carries a rule.`,
  },
  {
    trait: 'expressive-motion',
    reads: ['motion.animated-element-count', 'motion.transition-declaration-count'],
    decide: (animated, transitions) => (Number(animated) >= 4 || Number(transitions) >= 60 ? 'medium' : null),
    detail: (animated, transitions) => `${animated} animated element(s) and ${transitions} transition declaration(s).`,
  },
  {
    trait: 'restrained-motion',
    reads: ['motion.animated-element-count', 'motion.transition-declaration-count'],
    decide: (animated, transitions) => (Number(animated) === 0 && Number(transitions) <= 8 ? 'medium' : null),
    detail: (animated, transitions) => `${animated} animated element(s) and ${transitions} transition declaration(s).`,
  },
  {
    trait: 'sticky-navigation',
    reads: ['navigation.position'],
    decide: (value) => (value === 'sticky' || value === 'fixed' ? 'high' : null),
    detail: (value) => `The primary navigation is positioned ${value}.`,
  },
  {
    trait: 'disclosure-navigation',
    reads: ['responsive.mobile-navigation-collapsed'],
    decide: (value) => (value === true ? 'high' : null),
    detail: () => 'Navigation collapses behind a control at mobile width.',
  },
  {
    trait: 'inline-navigation',
    reads: ['responsive.mobile-navigation-collapsed'],
    decide: (value) => (value === false ? 'medium' : null),
    detail: () => 'Navigation stays visible at mobile width.',
  },
  {
    trait: 'mobile-simplification',
    reads: ['responsive.mobile-section-gap-px', 'spacing.section-gap-median-px'],
    decide: (mobile, desktop) => (Number(desktop) > 0 && Number(mobile) > 0 && Number(mobile) <= Number(desktop) * 0.8 ? 'medium' : null),
    detail: (mobile, desktop) => `Sections tighten from ${Math.round(desktop)}px to ${Math.round(mobile)}px on a phone.`,
  },
]);

function observationIndex(observed) {
  const index = new Map();
  for (const category of OBSERVATION_CATEGORIES) {
    for (const observation of list(observed?.[category])) {
      index.set(`${category}.${observation.measure}`, observation);
    }
  }
  return index;
}

/**
 * Turn measurements into traits, and refuse to invent one.
 *
 * A rule fires only when every measurement it names is present, and the trait
 * it produces carries the observation ids behind it. That is what makes
 * `interpreted` auditable: a trait with no `fromObservations` cannot be written
 * here, and the schema refuses one written anywhere else.
 */
export function interpretObservations(observed) {
  const index = observationIndex(observed);
  const interpreted = [];
  for (const rule of INTERPRETATION_RULES) {
    const found = rule.reads.map((key) => index.get(key));
    if (found.some((observation) => observation === undefined || observation.value === null)) continue;
    const values = found.map((observation) => observation.value);
    const confidence = rule.decide(...values);
    if (!confidence) continue;
    interpreted.push({
      trait: rule.trait,
      confidence,
      fromObservations: found.map((observation) => observation.id),
      detail: rule.detail(...values),
    });
  }
  return interpreted;
}

/**
 * Read a person's own sentence against the trait vocabulary.
 *
 * Lexical, and says so. "I like the polish and motion but not the dark palette"
 * becomes `expressive-motion: like` and `dark-ground: dislike` because those
 * phrases are in `config/visual-reference-traits.json`, not because anything
 * understood the sentence. The phrase that matched is recorded with the trait,
 * so a person who is misread can see the misreading and correct it instead of
 * arguing with a black box.
 *
 * Negation is handled at the clause level rather than the sentence level: a
 * sentence is split on the words that turn a preference around, and a phrase
 * inherits the polarity of the clause it appears in.
 */
const NEGATIONS = Object.freeze(['not ', "n't ", 'no ', 'avoid', 'without', 'less ', 'dislike', 'hate', 'too much', 'apart from', 'except', 'but not']);
const CLAUSE_SPLIT = /(?:[.;,!?]|\bbut\b|\bthough\b|\balthough\b|\bhowever\b|\bwhile\b)/i;

export function readReferenceNote(note, traitRegistry) {
  const text = String(note ?? '').toLowerCase();
  if (!text.trim()) return [];
  const phrases = Object.entries(traitRegistry?.phrases ?? {}).sort((a, b) => b[0].length - a[0].length);
  const found = new Map();
  for (const clause of text.split(CLAUSE_SPLIT)) {
    const segment = ` ${clause.trim()} `;
    if (!segment.trim()) continue;
    const polarity = NEGATIONS.some((marker) => segment.includes(marker)) ? 'dislike' : 'like';
    for (const [phrase, trait] of phrases) {
      if (!segment.includes(phrase)) continue;
      // First reading wins, and the longest phrase is tried first, so "dark
      // palette" is not also read as the bare word "dark".
      if (found.has(trait)) continue;
      found.set(trait, { trait, phrase, polarity });
    }
  }
  return [...found.values()];
}

function traitDefinition(traitRegistry, trait) {
  const definition = traitRegistry?.traits?.[trait];
  if (!definition) throw new Error(`Unknown design-reference trait: ${String(trait)}. The vocabulary is closed; add it to ${VISUAL_REFERENCE_TRAITS_PATH} with a consumer before anything may state it.`);
  return definition;
}

function describeTrait(traitRegistry, trait, { source, confidence, detail = null }) {
  const definition = traitDefinition(traitRegistry, trait);
  return {
    trait,
    label: definition.label,
    useFor: definition.useFor,
    source,
    confidence,
    consumer: definition.consumer ?? null,
    consumerAbsentReason: definition.consumer ? null : definition.unconsumedReason ?? null,
    prefer: { ...definition.adopt?.prefer },
    refuse: { ...definition.avoid?.refuse },
    detail,
  };
}

/**
 * Resolve one reference into the two lists a build reads.
 *
 * The rules, in the order they matter:
 *
 *   1. What the person said outranks what the page showed. A reference whose
 *      note dislikes a trait never adopts it, however strongly the capture
 *      measured it.
 *   2. `useFor` narrows. A reference supplied "for its typography" contributes
 *      typography traits and stays silent about motion, because the person
 *      already said which part of it they meant.
 *   3. An observation and a statement that agree raise confidence and are
 *      recorded as `observed-and-user-stated`, so a reviewer can see the two
 *      halves agreeing rather than a single unattributed claim.
 *   4. `preference: dislike` turns the whole reference around: what was
 *      measured becomes what to avoid. That is what "this is the sort of thing
 *      I do not want" means.
 */
export function resolveReferenceTraits({ interpreted = [], userIntent = {}, traitRegistry }) {
  const useFor = new Set(list(userIntent.useFor));
  const stated = new Map();
  for (const trait of list(userIntent.liked)) stated.set(trait, 'like');
  for (const trait of list(userIntent.disliked)) stated.set(trait, 'dislike');
  for (const reading of list(userIntent.readFromNote)) {
    if (!stated.has(reading.trait)) stated.set(reading.trait, reading.polarity);
  }

  const admits = (trait) => useFor.size === 0 || useFor.has(traitDefinition(traitRegistry, trait).useFor);
  const inverted = userIntent.preference === 'dislike';

  const adopt = new Map();
  const avoid = new Map();

  for (const entry of interpreted) {
    if (!admits(entry.trait)) continue;
    const said = stated.get(entry.trait);
    if (said === 'dislike') {
      avoid.set(entry.trait, describeTrait(traitRegistry, entry.trait, { source: 'observed-and-user-stated', confidence: 'high', detail: entry.detail }));
      continue;
    }
    const target = inverted ? avoid : adopt;
    const source = said === 'like' ? 'observed-and-user-stated' : 'observed';
    const confidence = said === 'like' ? 'high' : entry.confidence;
    target.set(entry.trait, describeTrait(traitRegistry, entry.trait, { source, confidence, detail: entry.detail }));
  }

  for (const [trait, polarity] of stated) {
    if (!admits(trait)) continue;
    const target = polarity === 'dislike' ? avoid : inverted ? avoid : adopt;
    if (target.has(trait)) continue;
    // A stated trait the capture did not support is still the person's
    // decision. It is recorded as `user-stated`, never as an observation.
    target.set(trait, describeTrait(traitRegistry, trait, { source: 'user-stated', confidence: 'medium', detail: null }));
  }

  // A trait cannot be on both lists. Avoidance wins, because refusing something
  // a person said they disliked is the safer of the two mistakes.
  for (const trait of avoid.keys()) adopt.delete(trait);

  const order = (entries) => [...entries.values()].sort((a, b) => a.trait.localeCompare(b.trait));
  return { adopt: order(adopt), avoid: order(avoid) };
}

function overallConfidence({ adopt, avoid, createdFromEvidence }) {
  const traits = [...adopt, ...avoid];
  if (!traits.length) return 'low';
  const best = Math.max(...traits.map((trait) => CONFIDENCE_RANK[trait.confidence] ?? 0));
  // A reference nobody could capture rests on what a person said. That is a
  // legitimate input and it is not a measurement, so it is capped.
  if (!createdFromEvidence) return best >= 1 ? 'medium' : 'low';
  return CONFIDENCES[best];
}

/**
 * Assemble one durable analysis.
 *
 * `createdFromEvidence` is the field a reviewer should read first: false means
 * the browser never reached the page and every trait here came from a sentence.
 */
export function buildReferenceAnalysis({
  projectId,
  sourceRef,
  observed = null,
  capture = null,
  evidenceHash = null,
  userIntent = {},
  traitRegistry,
  createdAt,
  rationale = null,
} = {}) {
  if (!projectId) throw new Error('A design reference belongs to a project.');
  if (!createdAt) throw new Error('A design reference records when it was analysed.');
  if (!REFERENCE_PREFERENCES.includes(userIntent.preference ?? 'like')) {
    throw new Error(`Unknown reference preference: ${String(userIntent.preference)}. It offers: ${REFERENCE_PREFERENCES.join(', ')}.`);
  }
  if (!REFERENCE_INFLUENCES.includes(userIntent.influence ?? 'medium')) {
    throw new Error(`Unknown reference influence: ${String(userIntent.influence)}. It offers: ${REFERENCE_INFLUENCES.join(', ')}.`);
  }

  const emptyObservations = Object.fromEntries(OBSERVATION_CATEGORIES.map((category) => [category, []]));
  const observations = { ...emptyObservations, ...observed };
  const interpreted = interpretObservations(observations);
  // Measured, not described. A reference whose observations support no trait —
  // an uploaded picture, or a page the browser could not reach — rests on what
  // the person said, and a reviewer has to be able to see the difference.
  const createdFromEvidence = interpreted.length > 0;
  const readFromNote = readReferenceNote(userIntent.note, traitRegistry);
  const intent = {
    preference: userIntent.preference ?? 'like',
    influence: userIntent.influence ?? 'medium',
    useFor: [...list(userIntent.useFor)],
    liked: [...list(userIntent.liked)],
    disliked: [...list(userIntent.disliked)],
    note: userIntent.note ? String(userIntent.note) : null,
    readFromNote,
  };
  const { adopt, avoid } = resolveReferenceTraits({ interpreted, userIntent: intent, traitRegistry });

  const analysis = {
    schemaVersion: 1,
    referenceId: referenceId({ projectId, sourceRef, createdAt }),
    projectId,
    sourceRef: { ...sourceRef, instructionAuthority: 'none', rightsStatus: 'reference-only', publishUseAllowed: false },
    instructionAuthority: 'none',
    evidenceHash,
    capture,
    observed: observations,
    interpreted,
    userIntent: intent,
    adopt,
    avoid,
    confidence: overallConfidence({ adopt, avoid, createdFromEvidence }),
    rationale,
    createdFromEvidence,
    approval: { state: 'draft', approvedBy: null, approvedAt: null },
    createdAt,
  };
  assertReferenceIsNotContent(analysis);
  return analysis;
}

/**
 * The copying boundary, as an assertion rather than a promise.
 *
 * A public reference URL grants observation. It does not grant republication of
 * the page's words, its photographs, its icons, its stylesheet or its markup,
 * and the difference between "we abstracted traits" and "we scraped a site" is
 * exactly whether that material is in the record. So this refuses:
 *
 *   - anything that looks like markup or a stylesheet rule;
 *   - anything that carries a URL to fetch a source asset;
 *   - a free-text observation long enough to be source copy;
 *   - a trait outside the closed vocabulary;
 *   - a reference whose rights were widened past observation.
 *
 * It runs on every write. A boundary checked once, at review time, is a
 * boundary that holds until somebody adds a second writer.
 */
const MARKUP = /<\/?[a-z][\s\S]*>/i;
const STYLE_RULE = /[{};]|url\(|@media|!important/i;
const ASSET_URI = /\b(?:data:|blob:)|\.(?:png|jpe?g|gif|webp|avif|svg|woff2?|ttf|otf|css|js|mp4|webm)\b/i;
const MAXIMUM_OBSERVATION_TEXT = 120;

export function assertReferenceIsNotContent(analysis, traitRegistry = null) {
  if (analysis?.instructionAuthority !== 'none') {
    throw new Error('A design reference is source data. Its instructionAuthority must be none.');
  }
  if (analysis?.sourceRef?.instructionAuthority !== 'none') {
    throw new Error('A design reference source must carry instructionAuthority none.');
  }
  if (analysis?.sourceRef?.rightsStatus !== 'reference-only' || analysis?.sourceRef?.publishUseAllowed !== false) {
    throw new Error('A design reference grants observation, never republication. Its rights stay reference-only and publishUseAllowed stays false.');
  }
  for (const category of OBSERVATION_CATEGORIES) {
    for (const observation of list(analysis?.observed?.[category])) {
      for (const [field, value] of Object.entries(observation)) {
        if (typeof value !== 'string') continue;
        if (field === 'id' || field === 'measure' || field === 'viewport' || field === 'unit') continue;
        if (value.length > MAXIMUM_OBSERVATION_TEXT) {
          throw new Error(`Observation ${observation.id}.${field} carries ${value.length} characters of text. A reference contributes measurements, not the source's words.`);
        }
        if (MARKUP.test(value) || STYLE_RULE.test(value)) {
          throw new Error(`Observation ${observation.id}.${field} carries markup or a style rule. A reference contributes measurements, not the source's implementation.`);
        }
        if (ASSET_URI.test(value)) {
          throw new Error(`Observation ${observation.id}.${field} points at a source asset. A reference never brings the source's imagery, fonts or stylesheets with it.`);
        }
      }
    }
  }
  if (traitRegistry) {
    for (const trait of [...list(analysis.adopt), ...list(analysis.avoid)]) traitDefinition(traitRegistry, trait.trait);
  }
  return true;
}

/**
 * Combine several approved references into one bounded influence.
 *
 * Three sites, three opinions, and the factory has to synthesise rather than
 * average. What that means concretely:
 *
 *   - a refusal from any reference is a refusal. Avoidance does not compete;
 *     if one reference says "not a dark opening" the set does not present one.
 *   - a preference competes on declared influence, then on confidence. A
 *     reference marked `strong` beats one marked `medium` on the axis they
 *     disagree about, and only on that axis.
 *   - where two references disagree at the same influence and the same
 *     confidence, the axis is left alone and the disagreement is reported. The
 *     alternative is a build that is the mean of two design directions, which
 *     is not a third direction.
 *
 * A trait whose registry entry has no consumer contributes nothing and is
 * reported in `unconsumed`, so the Console can tell a person their preference
 * was heard and could not be acted on rather than implying it was.
 */
export function resolveReferenceInfluence(analyses, traitRegistry) {
  const approved = list(analyses).filter((analysis) => analysis?.approval?.state === 'approved');
  const prefer = {};
  const refuse = {};
  const conflicts = [];
  const unconsumed = [];
  const contributions = [];
  const claims = new Map();

  for (const analysis of approved) {
    const influence = analysis.userIntent?.influence ?? 'medium';
    for (const trait of list(analysis.avoid)) {
      if (!trait.consumer) {
        unconsumed.push({ referenceId: analysis.referenceId, trait: trait.trait, intent: 'avoid', reason: trait.consumerAbsentReason });
        continue;
      }
      for (const [axis, values] of Object.entries(trait.refuse ?? {})) {
        refuse[axis] = [...new Set([...(refuse[axis] ?? []), ...list(values)])].sort();
      }
      contributions.push({ referenceId: analysis.referenceId, trait: trait.trait, intent: 'avoid', influence });
    }
  }

  for (const analysis of approved) {
    const influence = analysis.userIntent?.influence ?? 'medium';
    for (const trait of list(analysis.adopt)) {
      if (!trait.consumer) {
        unconsumed.push({ referenceId: analysis.referenceId, trait: trait.trait, intent: 'adopt', reason: trait.consumerAbsentReason });
        continue;
      }
      for (const [axis, value] of Object.entries(trait.prefer ?? {})) {
        const claim = { axis, value, referenceId: analysis.referenceId, trait: trait.trait, influence, confidence: trait.confidence };
        const standing = claims.get(axis);
        if (!standing) {
          claims.set(axis, claim);
          continue;
        }
        if (standing.value === value) continue;
        const byInfluence = (INFLUENCE_RANK[claim.influence] ?? 1) - (INFLUENCE_RANK[standing.influence] ?? 1);
        const byConfidence = (CONFIDENCE_RANK[claim.confidence] ?? 1) - (CONFIDENCE_RANK[standing.confidence] ?? 1);
        if (byInfluence > 0 || (byInfluence === 0 && byConfidence > 0)) {
          conflicts.push(conflict(axis, claim, standing, 'resolved', claim));
          claims.set(axis, claim);
        } else if (byInfluence < 0 || (byInfluence === 0 && byConfidence < 0)) {
          conflicts.push(conflict(axis, standing, claim, 'resolved', standing));
        } else {
          conflicts.push(conflict(axis, standing, claim, 'unresolved', null));
          claims.set(axis, { ...standing, contested: true });
        }
      }
      contributions.push({ referenceId: analysis.referenceId, trait: trait.trait, intent: 'adopt', influence });
    }
  }

  for (const [axis, claim] of claims) {
    if (claim.contested) continue;
    // A refusal beats a preference from another reference. Preferring a value
    // one reference forbade would be the set overruling its own refusal.
    if (list(refuse[axis]).includes(claim.value)) {
      conflicts.push({
        axis,
        kind: 'preference-refused',
        resolution: 'resolved',
        detail: `${claim.trait} prefers ${axis} ${claim.value}, which another reference refuses. The refusal stands.`,
        claims: [{ referenceId: claim.referenceId, trait: claim.trait, value: claim.value, influence: claim.influence }],
        applied: null,
      });
      continue;
    }
    prefer[axis] = claim.value;
  }

  if (traitRegistry) {
    for (const analysis of approved) {
      for (const trait of [...list(analysis.adopt), ...list(analysis.avoid)]) traitDefinition(traitRegistry, trait.trait);
    }
  }

  return {
    schemaVersion: 1,
    referenceIds: approved.map((analysis) => analysis.referenceId),
    prefer,
    refuse,
    conflicts,
    unconsumed,
    contributions,
    influenced: Object.keys(prefer).length > 0 || Object.keys(refuse).length > 0,
  };
}

function conflict(axis, winner, loser, resolution, applied) {
  return {
    axis,
    kind: 'competing-preference',
    resolution,
    detail: resolution === 'resolved'
      ? `${winner.trait} (${winner.influence} influence) and ${loser.trait} (${loser.influence}) both steer ${axis}. ${winner.trait} wins.`
      : `${winner.trait} and ${loser.trait} steer ${axis} to different values at the same influence and confidence. Neither is applied; choose one.`,
    claims: [winner, loser].map((claim) => ({ referenceId: claim.referenceId, trait: claim.trait, value: claim.value, influence: claim.influence })),
    applied: applied ? applied.value : null,
  };
}

/** Every trait the vocabulary offers, for a Console that must not hard-code it. */
export function referenceTraitCatalogue(traitRegistry) {
  return Object.entries(traitRegistry?.traits ?? {}).map(([trait, definition]) => ({
    trait,
    label: definition.label,
    useFor: definition.useFor,
    describe: definition.describe ?? null,
    opposite: definition.opposite ?? null,
    consumer: definition.consumer ?? null,
    consumerAbsentReason: definition.consumer ? null : definition.unconsumedReason ?? null,
  }));
}
