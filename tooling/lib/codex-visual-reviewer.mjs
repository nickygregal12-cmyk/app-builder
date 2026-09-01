/**
 * An independent visual reviewer, backed by a genuinely different vendor.
 *
 * Phase 4D has one thing left in it. Every row of the professional-output gate
 * in docs/VISUAL_EXCELLENCE.md §9 is satisfied or conditionally deferred except
 * the reviewer itself: the correction loop is closed, the bar is declared, the
 * evidence is captured and portable, and no verdict has ever been issued
 * because the only runtime available was the one that produced the work. Rule
 * 17 does not bend for that, and restarting the same model is not independence.
 *
 * This module is the other vendor. It reviews a portable review packet — the
 * directory `writeVisualReviewPacket` produces and the hosted evidence workflow
 * uploads — by handing the actual captures to Codex and recording what it says.
 *
 * ## Why the identity here can be believed
 *
 * `assertIndependentReview` compares vendors, and its own documentation is
 * blunt about the limit: vendor is declared, not attested, so a caller that
 * lies defeats it. The defence it names is structural and upstream — "an
 * adapter stamps its own identity from what it is rather than accepting one
 * from its caller", and "a path that takes `vendor` from request input is a
 * path where this guard means nothing."
 *
 * So this is that path, built the way that sentence requires:
 *
 * - `REVIEWER_VENDOR` is a module constant. It is `openai` because this module
 *   executes the OpenAI CLI and for no other reason, and there is no argument,
 *   option or environment variable that can change it.
 * - A caller that tries to supply an identity is refused outright rather than
 *   ignored. Silently dropping a supplied vendor would leave a caller believing
 *   it had chosen one, and the next reader unable to tell which paths honour it.
 * - `model` is read from what Codex reports about itself, and falls back to the
 *   CLI build that ran. It is the audit trail; vendor is the load-bearing half,
 *   and vendor is the half this module actually knows.
 *
 * ## Why it will not run by accident
 *
 * `config/model-execution.json` is committed `enabled: false` and is the
 * repository's answer to "may the factory spend money on a model right now".
 * This module is not that lane — it is a local operator tool driving a CLI the
 * operator already authenticated, not the hosted broker with its signed
 * decisions and budgets — but deny-by-default is the house rule either way, so
 * it refuses to execute without an explicit `authorised: true` from its caller.
 * Nothing in the ordinary acceptance path passes it.
 *
 * ## What it will not do
 *
 * It will not report a criterion as passed on evidence that does not cover it.
 * Coverage is computed here from the capture inventory rather than accepted
 * from the reviewer, because a reviewer asked "did you look at mobile?" has an
 * obvious incentive and no way to be checked. An uncovered criterion is
 * `unproven`, and a candidate carrying one cannot be passed at all.
 *
 * ## The known boundary, stated rather than discovered
 *
 * `scoreVisualReview` currently requires a verdict to score **every** scoped
 * criterion, so a verdict this module produces with an unproven criterion is
 * refused by `recordVisualCandidateReview` rather than stored. That refusal is
 * the safe direction — the alternative is a reviewer forced to invent a score
 * for evidence nobody captured — but it does mean an unproven verdict is
 * currently un-recordable rather than recordable as unproven.
 *
 * It does not block the ordinary path: the nbm evidence run captures three
 * viewports across six routes, so every scoped criterion is covered and the
 * verdict records normally. Teaching the score model an `unproven` state is
 * the separate piece of work that closes this, and until it lands the failure
 * is loud rather than silent.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { VIEWPORTS as EVIDENCE_VIEWPORTS } from './rendered-evidence.mjs';
import { auditVerdictAgainstScale, QUALITY_TIERS, SCORE_BANDS } from './visual-rubric.mjs';
import { assertComparisonRecorded, deriveBenchmarkGap, PAIRWISE_DIMENSIONS, selectReference } from './visual-benchmarks.mjs';

/**
 * Stamped, never accepted.
 *
 * This constant is the whole reason a verdict from this module means anything.
 * If it ever becomes a parameter, delete the module: an adapter that takes its
 * vendor from its caller is a self-report wearing an adapter's name.
 */
export const REVIEWER_VENDOR = 'openai';
export const REVIEWER_ROLE = 'design-critic';

export const VISUAL_REVIEW_VERDICTS = ['pass', 'rework', 'reject'];

/**
 * What each criterion needs photographed before it can be scored at all.
 *
 * Declared rather than inferred, because "which pictures answer this question?"
 * is a judgement and judgements belong somewhere a reader can find them. The
 * default is one capture: a criterion nobody photographed anything for is not a
 * criterion anybody looked at.
 *
 * Where a criterion's question names particular widths, the rule names them too.
 * Counting distinct viewports is not enough: `responsive-quality` asks whether
 * the *mobile* rendering is a designed composition or the desktop one with
 * fewer columns, and captures at 1440 and 1024 are two distinct viewports that
 * answer it no better than one does. A count is satisfied by any two widths; the
 * question is only satisfied by the phone and the desktop it would have been
 * narrowed from.
 */
export const CRITERION_EVIDENCE = Object.freeze({
  'responsive-recomposition': Object.freeze({
    requiredViewports: Object.freeze(['desktop', 'mobile']),
    minRoutes: 2,
    reason: 'the question is whether the mobile rendering is designed or merely narrowed, which needs the phone and the desktop it would have been narrowed from, on more than the one page anybody would have tuned',
  }),
  'visual-material': Object.freeze({
    requiredViewports: Object.freeze(['desktop', 'mobile']),
    reason: 'framing at every width is half the question, and material framed well on a desktop can be cropped to nonsense on a phone',
  }),
  'information-architecture': Object.freeze({
    minRoutes: 3,
    reason: 'the question is what belongs on Home, what deserves its own route and what is merely previewed, which cannot be answered from Home alone',
  }),
  'composition-pacing': Object.freeze({
    minRoutes: 2,
    reason: 'pacing is a relationship between successive screens and between pages, so one page cannot demonstrate it',
  }),
  'interaction-craft': Object.freeze({
    minRoutes: 2,
    reason: 'consistency of small decisions is only visible across more than one surface',
  }),
  'memorability': Object.freeze({
    minRoutes: 2,
    reason: 'a signature that exists only on the home page is a hero treatment, not a signature experience',
  }),
});

/**
 * The default, and the hole it used to leave.
 *
 * `minRoutes` is new and it is the more important half. Coverage was computed
 * from viewports alone, so two captures of the home page — desktop and mobile —
 * satisfied every criterion including responsive quality and information
 * architecture. A single well-tuned home page could carry a whole multi-page
 * site to a top score, which is exactly the claim a home page cannot support.
 */
const DEFAULT_EVIDENCE = Object.freeze({
  minViewports: 1,
  minRoutes: 1,
  requiredViewports: Object.freeze([]),
  reason: 'a criterion needs at least one capture to have been looked at',
});

// A rule that names a viewport the evidence plan cannot produce would make its
// criterion permanently unproven, which fails closed but for a reason nobody
// could find. The registry is closed, so check against it here rather than
// discovering the typo during a review.
for (const [id, rule] of Object.entries(CRITERION_EVIDENCE)) {
  for (const name of rule.requiredViewports ?? []) {
    if (!EVIDENCE_VIEWPORTS.some((viewport) => viewport.name === name)) {
      throw new Error(`CRITERION_EVIDENCE for ${id} requires viewport "${name}", which rendered-evidence.mjs does not capture.`);
    }
  }
}

const list = (value) => (Array.isArray(value) ? value : []);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Which criteria this candidate's captures can actually support.
 *
 * Computed from the capture inventory, never from the reviewer's own account of
 * what it examined.
 */
export function criterionCoverage(criteria, captures, { artifactRouteCount = null } = {}) {
  const viewports = new Set(list(captures).map((capture) => capture?.viewport).filter(Boolean));
  const routes = new Set(list(captures).map((capture) => capture?.route).filter(Boolean));
  const present = [...viewports].sort();
  const presentRoutes = [...routes].sort();
  return list(criteria).map((criterion) => {
    const rule = { ...DEFAULT_EVIDENCE, ...CRITERION_EVIDENCE[criterion.id] };
    const required = list(rule.requiredViewports);
    const missing = required.filter((name) => !viewports.has(name));
    const minimum = rule.minViewports ?? 1;
    // A route minimum cannot exceed the routes the artifact has.
    //
    // `minRoutes` exists to stop a home page standing in for pages that exist
    // and nobody looked at. Where no other pages exist there is nothing being
    // stood in for, and holding a single-page artifact to a three-route
    // minimum marks it unproven for evidence it could not possibly produce —
    // which fails closed for a reason nobody could act on.
    //
    // The count comes from what the ARTIFACT declares, never from what the
    // capture run happened to photograph. Deriving it from the captures would
    // make a lazy capture self-justifying: photograph one page, declare one
    // page, satisfy every minimum.
    const declared = Number.isInteger(artifactRouteCount) && artifactRouteCount > 0 ? artifactRouteCount : null;
    const minimumRoutes = declared === null ? (rule.minRoutes ?? 1) : Math.min(rule.minRoutes ?? 1, declared);
    const routesShort = routes.size < minimumRoutes;
    const covered = missing.length === 0 && viewports.size >= minimum && !routesShort;

    // Three ways to be short of the evidence, and they read differently.
    // Naming a missing width or a missing page is actionable; naming a
    // shortfall in a count is not.
    let detail = null;
    if (missing.length) {
      detail = `${criterion.id} is unproven: ${rule.reason}. The captures cover ${present.join(', ') || 'no viewport'}, and this needs ${required.join(' and ')}.`;
    } else if (routesShort) {
      detail = `${criterion.id} is unproven: ${rule.reason}. The captures cover ${routes.size} route(s) (${presentRoutes.join(', ') || 'none'}) and it needs ${minimumRoutes}.`;
    } else if (viewports.size < minimum) {
      detail = `${criterion.id} is unproven: ${rule.reason}. The captures cover ${viewports.size} viewport(s) and it needs ${minimum}.`;
    }

    return {
      id: criterion.id,
      question: criterion.question ?? null,
      covered,
      viewports: present,
      routes: presentRoutes,
      requiredViewports: required,
      minimumViewports: minimum,
      minimumRoutes,
      missingViewports: missing,
      status: covered ? 'evidenced' : 'unproven',
      detail,
    };
  });
}

/**
 * Whether the evidence supports the *claim* being made about the site.
 *
 * Criterion coverage answers "may this question be scored at all". This
 * answers a different one: a top-of-scale claim about a multi-page website
 * needs to have looked at the website. A spectacular home page beside generic
 * project pages, a weak contact route or a poor mobile rendering is not a 10,
 * and the only way to know is to have captured them.
 *
 * Returned as a cap rather than a refusal, so a thin evidence run still
 * produces a usable verdict — it just cannot produce a benchmark claim.
 */
export const EVIDENCE_TIERS = Object.freeze([
  Object.freeze({ maxScore: 10, minRoutes: 4, minViewports: 2, label: 'site-level', reason: 'a benchmark claim about a website needs the website: several routes, at more than one width' }),
  Object.freeze({ maxScore: 9, minRoutes: 3, minViewports: 2, label: 'multi-route', reason: 'an exceptional claim needs the key secondary routes, not only the home page' }),
  Object.freeze({ maxScore: 8, minRoutes: 2, minViewports: 2, label: 'two-route', reason: 'a strong-professional claim needs more than one page and more than one width' }),
  Object.freeze({ maxScore: 7, minRoutes: 1, minViewports: 1, label: 'thin', reason: 'a single page at a single width supports a professional reading and no more' }),
]);

export function evidenceCeiling(captures, { artifactRouteCount = null } = {}) {
  const routes = new Set(list(captures).map((capture) => capture?.route).filter(Boolean));
  const viewports = new Set(list(captures).map((capture) => capture?.viewport).filter(Boolean));
  // Same reasoning as the coverage rule, and the same guard: the ceiling asks
  // whether the review saw the ARTIFACT, not whether the artifact was large. A
  // one-page site fully photographed is complete evidence for a one-page site,
  // and capping it at 7 would say a single-page site cannot be excellent —
  // which is a claim about page count rather than about quality. Where the
  // artifact has more routes than were captured, the tier still bites.
  const declared = Number.isInteger(artifactRouteCount) && artifactRouteCount > 0 ? artifactRouteCount : null;
  const tier = EVIDENCE_TIERS.find((entry) => routes.size >= (declared === null ? entry.minRoutes : Math.min(entry.minRoutes, declared))
    && viewports.size >= entry.minViewports)
    ?? { maxScore: 6, label: 'insufficient', reason: 'there is not enough here to describe the site at all' };
  const covered = declared === null ? null : routes.size >= declared;
  return {
    cap: tier.maxScore,
    tier: tier.label,
    routes: routes.size,
    artifactRoutes: declared,
    coversWholeArtifact: covered,
    viewports: viewports.size,
    detail: declared !== null && covered
      ? `Evidence covers all ${declared} route(s) of this artifact at ${viewports.size} viewport(s). Nothing is unphotographed, so evidence caps the claim at ${tier.maxScore}.`
      : `Evidence covers ${routes.size} route(s) at ${viewports.size} viewport(s): ${tier.reason}. This caps any overall claim at ${tier.maxScore}.`,
  };
}

/** The exact evidence a verdict is bound to. */
export function evidenceBinding(candidate) {
  const captures = list(candidate?.captures);
  const digest = sha256(captures.map((capture) => `${capture.id}:${capture.sha256 ?? capture.contentHash ?? ''}`).sort().join('\n'));
  return {
    candidateId: candidate?.candidateId ?? null,
    compositionHash: candidate?.compositionHash ?? null,
    captureCount: captures.length,
    captureDigest: digest,
  };
}

export function readPacket(packetDir) {
  const file = path.join(packetDir, 'review.json');
  if (!fs.existsSync(file)) {
    throw new Error(`No review packet at ${file}. Point this at the directory the evidence run wrote, or at an unpacked nbm-visual-review artifact.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The reviewer's instructions.
 *
 * Deliberately not a description of the business: a critic told what the site
 * is for will describe what it was told, and the evidence is the pictures. It
 * gets the scoped criteria with their anchored bands, the DesignLint warnings
 * it must engage with, and the inventory of what each image is.
 *
 * ## What it no longer gets, and why that is the point
 *
 * The previous version of this function contained the line:
 *
 *     The bar is an overall mean of at least 8.5, and no single criterion
 *     below 6.5.
 *
 * We were telling the reviewer the number we wanted and then treating what
 * came back as independent evidence about quality. It is not surprising that
 * three prototypes returned 8.50, 8.63 and 8.67 against a bar of 8.5; a target
 * given to a model is a target it hits. The gate is applied downstream by
 * `assessProfessionalThreshold`, which is where it belongs, and the reviewer is
 * not told what it is.
 *
 * Everything the reviewer needs to produce a *meaningful* number it now has —
 * a written meaning for every point on the scale, and a per-criterion account
 * of what separates the upper levels. Everything that would tell it what number
 * to produce is withheld.
 */
export function buildPrompt({ packet, candidate, coverage, benchmark = null }) {
  const scored = coverage.filter((entry) => entry.covered);
  const unproven = coverage.filter((entry) => !entry.covered);
  const byId = new Map(list(packet.criteria).map((criterion) => [criterion.id, criterion]));

  const lines = [
    'You are reviewing rendered screenshots of a website. You did not design it, you are not being asked to be kind about it, and you are not being told what score anyone hopes for.',
    '',
    `Business: ${packet.business}. Visual direction under review: ${candidate.directionLabel ?? candidate.directionId}.`,
    '',
    'The images attached to this message are the only evidence. Judge what you can see and nothing else. Where a question needs evidence you were not given, say so instead of guessing.',
    '',
    'Images, in order:',
    ...list(candidate.captures).map((capture, index) => `  ${index + 1}. ${capture.route} at ${capture.viewport}${capture.state && Object.keys(capture.state).length ? ` (${JSON.stringify(capture.state)})` : ''}`),
    '',
    '=== THE SCALE ===',
    '',
    'Every point on this scale has a fixed meaning. Use it. Do not substitute your own sense of what a number out of ten usually means.',
    '',
    // The meaning already opens with the band's own words, so the label is not
    // repeated here. `1 — severely broken. Severely broken. Layout...` reads
    // like a stutter, and a prompt that reads carelessly gets read carelessly.
    ...SCORE_BANDS.map((band) => `  ${band.score} — ${band.meaning}`),
    '',
    'Scores move in steps of 0.5 and no finer. A 9.4 rather than a 9.5 claims a distinction this scale cannot defend.',
    '',
    'Read these before you score:',
    '',
    '  - 10 is extraordinarily rare. Most good websites are 7. Most professional agency work is 8. If you are issuing a 9 or a 10, you are making a strong claim and you will be asked to support it.',
    '  - Professional does not mean exceptional. "A capable designer could ship this" is a 7, and 7 is a respectable score, not a criticism.',
    '  - The absence of defects is not a 10. A site with nothing wrong and nothing remarkable is a 7. Faultlessness caps a score; it does not maximise one.',
    '  - Visual polish does not excuse weak communication. A beautiful site that never says what the business does has failed, and the visual criteria do not redeem that.',
    '  - Novelty is not quality. An unusual choice with no reason behind it is worse than a conventional one with a reason.',
    '  - Minimalism is not sophistication. Empty space is only premium when there is something behind it worth the room. Whitespace plus a serif is not restraint, it is absence.',
    '  - Motion is not craft. An animated generic site is a generic site. Judge the consistency of small decisions, not the presence of effects.',
    '  - Generic AI design language should be marked down: unjustified gradient headlines, icon-in-rounded-square triplets, rounded-card soup, fake logo walls, invented KPI rows, glowing blobs, dark closing CTA slabs, "innovation" copy. Context decides — one justified pill is fine, twenty default pills is a house style nobody chose.',
    '  - Appropriate restraint should be rewarded. A quiet, plain, extremely well-edited site for a serious business can score very highly. A restrained accountancy site does not need photography, animation or asymmetry to be excellent; judge sophistication appropriate to the problem.',
    '  - Business-specific decisions matter heavily. Ask constantly whether this design could be re-skinned for another company by changing the words and the colours.',
    '  - Judge mobile as its own composition, not as a narrower version of the desktop one.',
    '',
    '=== WHAT TO SCORE ===',
    '',
  ];

  for (const entry of scored) {
    const criterion = byId.get(entry.id) ?? {};
    lines.push(`  ${entry.id} — ${criterion.title ?? entry.id}`);
    lines.push(`    ${criterion.question ?? entry.question}`);
    if (criterion.separates) lines.push(`    What separates the levels: ${criterion.separates}`);
    lines.push('');
  }

  if (unproven.length) {
    lines.push(
      'Do NOT score these — the captures do not cover them, and they are already recorded as unproven:',
      ...unproven.map((entry) => `  - ${entry.id}: ${entry.detail}`),
      '',
    );
  }

  lines.push(
    '=== WHAT EVERY HIGH SCORE COSTS ===',
    '',
    'For every criterion you score 8 or above, answer: what prevents this from reaching the next level? Put it in "whyNotHigher". If you cannot name the shortfall, you have not made the distinction your score claims, and the score is too high.',
    '',
    'For every criterion you score 9 or above, name the demonstrated strengths in "positiveEvidence" — specific things you can see, not the absence of problems. A 9 that rests on "nothing is wrong" is a 7.',
    '',
    'For any criterion you score 10, answer in "whyBenchmark": what makes this genuinely benchmark-class rather than merely excellent?',
    '',
  );

  if (benchmark?.reference) {
    lines.push(
      '=== COMPARISON ===',
      '',
      `Compare this candidate against the following reference work. You are NOT asked whether it looks like the reference — a candidate in a completely different style may legitimately be judged comparable. You are asked whether it demonstrates a comparable level of authorship, craft, hierarchy and product/design thinking, for its own problem.`,
      '',
      `  Reference: ${benchmark.reference.name} (${benchmark.reference.url}), a ${benchmark.reference.qualityClass} example of ${list(benchmark.reference.anchorsFor).join(', ')}.`,
      `  What it does well: ${benchmark.reference.analysis}`,
      '',
      'For each dimension below, answer one of: candidate-stronger, roughly-comparable, reference-stronger, reference-substantially-stronger. Give a reason for each.',
      ...PAIRWISE_DIMENSIONS.map((dimension) => `  - ${dimension}`),
      '',
    );
  }

  const mustAddress = list(candidate.gate?.mustAddress);
  if (mustAddress.length) {
    lines.push(
      'A deterministic linter raised these warnings. You may disagree with any of them, but you must say something about each:',
      ...mustAddress.map((rule) => `  - ${rule}`),
      '',
    );
  }

  lines.push(
    '=== OBSERVATIONS ===',
    '',
    'Answer these plainly. They are observations, not scores, and they are used to check your scores are consistent with what you saw.',
    '',
    '  templateDerived — could a viewer identify this as a template or theme with its content changed?',
    '  interchangeableBusiness — with the logo removed, could this be a different company in a different sector?',
    '  mobileIsStackedDesktop — is the mobile view essentially the desktop layout in one column, rather than recomposed?',
    '  noSignatureMoment — is there no specific moment, interaction or composition you could describe as belonging to this site and no other?',
    '  typographyMerelyCompetent — is the typography correct and unremarkable rather than doing compositional work?',
    '  genericDesignLanguage — is the visual language the one shared by generated sites generally, rather than one chosen for this business?',
    '',
    '=== OVERALL ===',
    '',
    'Separately from the individual scores, give your overall reading in "holisticTier", one of:',
    ...QUALITY_TIERS.map((tier) => `  ${tier.id} — ${tier.meaning}`),
    '',
    'Answer this from your reaction to the site as a whole. Do not compute it from your scores, and do not adjust it to agree with them. If your criterion scores average high and your overall reading is lower, say the lower one — that disagreement is useful and it is recorded rather than reconciled.',
    '',
    'A "pass" means a professional studio would put its name on this. If it is competent but short of that, the answer is "rework", not a generous pass.',
    '',
    'Reply with JSON only, no prose around it, matching exactly:',
    '{',
    '  "verdict": "pass" | "rework" | "reject",',
    '  "model": "<the model you are, if you know it>",',
    '  "rationale": "<two or three sentences>",',
    '  "holisticTier": "<one of the tiers above>",',
    '  "criterionScores": [',
    ...scored.map((entry, index) => `    {"criterion": "${entry.id}", "score": <0-10, steps of 0.5>, "note": "<why>", "whyNotHigher": "<required if 8+>", "positiveEvidence": ["<required if 9+>"], "whyBenchmark": "<required if 10>"}${index === scored.length - 1 ? '' : ','}`),
    '  ],',
    '  "observations": {"templateDerived": <bool>, "interchangeableBusiness": <bool>, "mobileIsStackedDesktop": <bool>, "noSignatureMoment": <bool>, "typographyMerelyCompetent": <bool>, "genericDesignLanguage": <bool>},',
    '  "signatureMoment": "<the one thing you would remember, or null>",',
    benchmark?.reference
      ? `  "pairwiseComparison": {"referenceId": "${benchmark.reference.id}", "comparisons": [${PAIRWISE_DIMENSIONS.map((dimension) => `{"dimension": "${dimension}", "outcome": "<outcome>", "note": "<why>"}`).join(', ')}]},`
      : '  "pairwiseComparison": null,',
    '  "failingCriteria": ["<ids you consider failures>"],',
    '  "blockingConcerns": ["<anything that must change before this ships>"],',
    `  "addressedRules": [${mustAddress.map((rule) => `{"rule": "${rule}", "response": "<agree/disagree and why>"}`).join(', ')}]`,
    '}',
  );
  return lines.join('\n');
}

/**
 * Run Codex over a set of images with the prompt on stdin.
 *
 * Three details are load-bearing and were established by probing the CLI rather
 * than by reading its help: `-i` is variadic and swallows a positional prompt,
 * so the prompt must arrive on stdin; `--skip-git-repo-check` is required
 * because a packet directory is not a repository; and `--sandbox read-only`
 * keeps a reviewer that only needs to look at pictures unable to do anything
 * else.
 */
export function runCodexCli({ prompt, images, cwd, timeoutMs = 300000 }) {
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-i', ...images];
  const result = spawnSync('codex', args, { cwd, input: prompt, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not run codex: ${result.error.message}. Install the CLI, or review in the Console instead.`);
  if (result.status !== 0) {
    throw new Error(`codex exited ${result.status}: ${String(result.stderr ?? '').trim().split('\n').slice(-5).join('\n')}`);
  }
  return String(result.stdout ?? '');
}

function codexVersion() {
  const result = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout ?? '').trim() : 'codex-cli';
}

/**
 * Pull the JSON object out of whatever the CLI printed around it.
 *
 * Strict about the object and forgiving about its surroundings: a CLI is
 * entitled to print a banner, and a reviewer that refuses a good verdict
 * because of a log line is a reviewer nobody uses. What it will not do is
 * repair the object itself.
 */
export function extractVerdictJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidate = fenced ? fenced[1] : null;
  if (candidate) return JSON.parse(candidate);
  const start = String(text).indexOf('{');
  const end = String(text).lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`Codex returned no JSON verdict. It said: ${String(text).trim().slice(0, 400)}`);
  }
  return JSON.parse(String(text).slice(start, end + 1));
}

/**
 * Turn what Codex said into a verdict this repository will accept, or refuse it.
 *
 * Everything here is a refusal rather than a repair. A reviewer that scores a
 * criterion nobody photographed, or passes a candidate with an unproven
 * criterion, has produced a verdict that would be wrong in the durable record,
 * and quietly correcting it would hide that the reviewer did that.
 */
export function normaliseVerdict(raw, { candidate, coverage, model }) {
  if (!VISUAL_REVIEW_VERDICTS.includes(raw?.verdict)) {
    throw new Error(`Codex returned an unknown verdict: ${String(raw?.verdict)}. It offers: ${VISUAL_REVIEW_VERDICTS.join(', ')}.`);
  }
  const scorable = new Set(coverage.filter((entry) => entry.covered).map((entry) => entry.id));
  const unproven = coverage.filter((entry) => !entry.covered);

  const scores = list(raw.criterionScores);
  const scoredIds = new Set(scores.map((entry) => entry?.criterion));
  const extra = [...scoredIds].filter((id) => !scorable.has(id));
  if (extra.length) {
    throw new Error(`Codex scored ${extra.join(', ')}, which the captures do not cover. A score for evidence nobody has is worse than no score.`);
  }
  const missing = [...scorable].filter((id) => !scoredIds.has(id));
  if (missing.length) throw new Error(`Codex did not score ${missing.join(', ')}, which it was given evidence for.`);
  for (const entry of scores) {
    const value = Number(entry?.score);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      throw new Error(`Codex scored ${String(entry?.criterion)} as ${String(entry?.score)}. A criterion score is a number from 0 to 10.`);
    }
  }

  /**
   * The obligations that come with a high score, checked here rather than
   * downstream.
   *
   * `scoreVisualReview` refuses the same omissions, but by then the reviewer
   * has been paid for and gone. Catching it at the adapter means the failure
   * names the reviewer that produced it, and it is loud rather than silent —
   * the alternative is quietly accepting a 9 supported by nothing and letting
   * the record show a justified one.
   */
  const scaleProblems = auditVerdictAgainstScale(raw, { criteria: null });
  if (scaleProblems.length) {
    throw new Error(
      `Codex's verdict does not satisfy the scale it was given:\n  - ${scaleProblems.map((problem) => problem.detail).join('\n  - ')}\n`
      + 'Re-run the review; a score that cannot answer what is holding it back has not made the distinction it claims.',
    );
  }

  if (raw.holisticTier && !QUALITY_TIERS.some((tier) => tier.id === raw.holisticTier)) {
    throw new Error(`Codex returned holisticTier ${JSON.stringify(raw.holisticTier)}. It offers: ${QUALITY_TIERS.map((tier) => tier.id).join(', ')}.`);
  }

  // The rule the whole coverage computation exists to enforce. An unproven
  // criterion is not a low score to be averaged away; it is a question nobody
  // has the evidence to answer, and a pass would claim otherwise.
  if (raw.verdict === 'pass' && unproven.length) {
    throw new Error(
      `Codex passed ${candidate.candidateId}, but ${unproven.map((entry) => entry.id).join(', ')} is unproven on this evidence. `
      + 'Capture what the criterion needs and review again; an unproven criterion is never a passed one.',
    );
  }

  const addressed = list(raw.addressedRules);
  const mustAddress = list(candidate.gate?.mustAddress);
  const silent = mustAddress.filter((rule) => !addressed.some((entry) => (typeof entry === 'string' ? entry : entry?.rule) === rule));
  if (silent.length) {
    throw new Error(`Codex did not respond to the DesignLint warnings it was given: ${silent.join(', ')}. A reviewer may disagree with a warning; it may not be silent about one.`);
  }

  /**
   * The comparison, aggregated into a gap.
   *
   * A verdict with no comparison records `UNASSESSED` rather than `NONE`, and
   * the distinction is load-bearing: a missing comparison silently reading as
   * "no gap visible" is exactly how a top score gets issued by default.
   */
  const comparison = raw.pairwiseComparison ?? null;
  if (comparison) assertComparisonRecorded(comparison);
  const benchmark = deriveBenchmarkGap(comparison?.comparisons ?? []);

  const evidenceCap = evidenceCeiling(candidate.captures, { artifactRouteCount: candidate.artifactRouteCount ?? null });

  return {
    candidateId: candidate.candidateId,
    verdict: raw.verdict,
    // Stamped here, from what this module is. Nothing reaching this function
    // can influence it.
    reviewedBy: { role: REVIEWER_ROLE, vendor: REVIEWER_VENDOR, model },
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    criterionScores: scores.map((entry) => ({
      criterion: entry.criterion,
      score: Number(entry.score),
      note: entry.note ?? null,
      whyNotHigher: entry.whyNotHigher ?? null,
      positiveEvidence: list(entry.positiveEvidence).map(String),
      whyBenchmark: entry.whyBenchmark ?? null,
    })),
    holisticTier: raw.holisticTier ?? null,
    // The reviewer's plain answers, kept separate from its scores. The ceilings
    // in visual-rubric.mjs read these; nothing in this repository infers them
    // from pixels, because that would be a taste engine wearing a rule's name.
    observations: raw.observations ?? {},
    signatureMoment: raw.signatureMoment ?? null,
    pairwiseComparison: comparison,
    benchmarkGap: benchmark.gap,
    benchmarkGapDetail: benchmark.detail,
    benchmarkComparisonCounts: benchmark.counts,
    dimensionsNotCompared: comparison ? benchmark.dimensionsNotCompared : PAIRWISE_DIMENSIONS,
    evidenceCeiling: evidenceCap,
    failingCriteria: list(raw.failingCriteria).filter((id) => scorable.has(id)),
    blockingConcerns: list(raw.blockingConcerns).map(String),
    addressedRules: mustAddress,
    addressedRuleNotes: addressed.map((entry) => (typeof entry === 'string' ? { rule: entry, response: null } : { rule: entry?.rule ?? null, response: entry?.response ?? null })),
    unprovenCriteria: unproven.map((entry) => ({ criterion: entry.id, detail: entry.detail })),
    evidence: evidenceBinding(candidate),
  };
}

/**
 * Review one candidate.
 *
 * `authorised` is deliberately positional in the caller's mind: this spends the
 * operator's Codex credits and reaches a third-party service, so it does not
 * happen because a default was left alone.
 */
export function reviewCandidate({ packet, packetDir, candidateId, authorised = false, runCodex = runCodexCli, version = codexVersion, ...rest } = {}) {
  // A supplied identity is refused, not ignored. Ignoring it would let a caller
  // believe it had chosen the reviewer, and leave the next reader guessing
  // which paths honour such a thing.
  for (const field of ['reviewedBy', 'vendor', 'model', 'role']) {
    if (field in rest) {
      throw new Error(`${field} cannot be supplied to the Codex reviewer. It stamps its own identity from the runtime it invokes; an identity taken from a caller is a self-report, and independence built on one is worth nothing.`);
    }
  }
  if (authorised !== true) {
    throw new Error(
      'The Codex reviewer refuses to run without an explicit authorisation. It calls a third-party provider and spends real credits, '
      + 'and deny-by-default is the house rule for anything that does. Pass { authorised: true } from an operator decision.',
    );
  }

  const candidate = list(packet?.candidates).find((entry) => entry.candidateId === candidateId);
  if (!candidate) throw new Error(`The packet has no candidate ${candidateId}.`);
  if (candidate.gate?.status === 'blocked') {
    throw new Error(`Candidate ${candidateId} is blocked by ${list(candidate.gate.blocking).map((entry) => entry.rule).join(', ')}. A deterministic violation is not a matter for review.`);
  }

  // Declared by the packet, not derived from the captures. A packet that says
  // nothing keeps the conservative multi-route minimums.
  const artifactRouteCount = Number.isInteger(packet.artifactRouteCount) ? packet.artifactRouteCount : null;
  const coverage = criterionCoverage(packet.criteria, candidate.captures, { artifactRouteCount });
  const images = list(candidate.captures).map((capture) => path.resolve(packetDir, capture.file));
  const absent = images.filter((file) => !fs.existsSync(file));
  if (absent.length) throw new Error(`The packet references ${absent.length} capture(s) it does not contain, starting with ${absent[0]}. A review of missing pictures is not a review.`);
  if (!images.length) throw new Error(`Candidate ${candidateId} has no captures. There is nothing to review.`);

  // The reference is chosen from the shape of the business problem, never from
  // visual similarity. A packet that declares neither is compared against
  // nothing rather than against something arbitrary, and the verdict records
  // `UNASSESSED`, which caps it below 10.
  const benchmark = selectReference({ businessKind: packet.businessKind ?? null, anchors: list(packet.benchmarkAnchors) });

  const prompt = buildPrompt({ packet, candidate, coverage, benchmark: benchmark.matched ? benchmark : null });
  const output = runCodex({ prompt, images, cwd: packetDir });
  const raw = extractVerdictJson(output);
  // Codex's own account of which model it is, falling back to the CLI build
  // that ran. Vendor is what this module knows for certain; model is the audit
  // trail, and a wrong audit trail is better than a fabricated one.
  const model = typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : version();
  return normaliseVerdict(raw, { candidate, coverage, model });
}

/**
 * Review every reviewable candidate in a packet and emit a verdicts file.
 *
 * The output is the shape `visual-candidate-acceptance.mjs --verdicts` already
 * reads, so this adds a reviewer to the existing lane rather than a second way
 * to record a decision. It deliberately does not choose what to promote: one
 * candidate passing is not the same as it being the one to ship, and the set
 * decision stays with the operator.
 */
export function reviewPacketCandidates({ packetDir, authorised = false, runCodex = runCodexCli, version = codexVersion } = {}) {
  const packet = readPacket(packetDir);
  const reviewable = list(packet.candidates).filter((candidate) => candidate.gate?.status !== 'blocked');
  const reviews = reviewable.map((candidate) => reviewCandidate({ packet, packetDir, candidateId: candidate.candidateId, authorised, runCodex, version }));
  return {
    schemaVersion: 1,
    setId: packet.setId,
    projectId: packet.projectId,
    reviewedAt: new Date().toISOString(),
    reviews,
    skipped: list(packet.candidates)
      .filter((candidate) => candidate.gate?.status === 'blocked')
      .map((candidate) => ({ candidateId: candidate.candidateId, reason: 'deterministically blocked' })),
  };
}
