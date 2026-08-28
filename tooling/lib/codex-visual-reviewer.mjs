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
 * `responsive-quality` is the one that matters most and the one a single
 * screenshot silently fakes. Its question — is the mobile rendering a designed
 * composition, or the desktop one with fewer columns? — cannot be answered by
 * any number of captures at one width, so it requires at least two distinct
 * viewports and says so.
 */
export const CRITERION_EVIDENCE = Object.freeze({
  'responsive-quality': Object.freeze({ minViewports: 2, reason: 'comparing widths is the question; one width cannot answer it' }),
});

const DEFAULT_EVIDENCE = Object.freeze({ minViewports: 1, reason: 'a criterion needs at least one capture to have been looked at' });

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
export function criterionCoverage(criteria, captures) {
  const viewports = new Set(list(captures).map((capture) => capture?.viewport).filter(Boolean));
  return list(criteria).map((criterion) => {
    const rule = CRITERION_EVIDENCE[criterion.id] ?? DEFAULT_EVIDENCE;
    const covered = viewports.size >= rule.minViewports;
    return {
      id: criterion.id,
      question: criterion.question ?? null,
      covered,
      viewports: [...viewports].sort(),
      requiredViewports: rule.minViewports,
      status: covered ? 'evidenced' : 'unproven',
      detail: covered ? null : `${criterion.id} is unproven: ${rule.reason}. The captures cover ${viewports.size} viewport(s) and it needs ${rule.minViewports}.`,
    };
  });
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
 * gets the scoped criteria, the bar, the DesignLint warnings it must engage
 * with, and the inventory of what each image is.
 */
export function buildPrompt({ packet, candidate, coverage }) {
  const scored = coverage.filter((entry) => entry.covered);
  const unproven = coverage.filter((entry) => !entry.covered);
  const gate = packet.qualityGate ?? {};
  const lines = [
    'You are reviewing rendered screenshots of a generated website. You did not design it and you are not being asked to be kind about it.',
    '',
    `Business: ${packet.business}. Visual direction under review: ${candidate.directionLabel ?? candidate.directionId}.`,
    '',
    'The images attached to this message are the only evidence. Judge what you can see and nothing else.',
    '',
    'Images, in order:',
    ...list(candidate.captures).map((capture, index) => `  ${index + 1}. ${capture.route} at ${capture.viewport}${capture.state && Object.keys(capture.state).length ? ` (${JSON.stringify(capture.state)})` : ''}`),
    '',
    `Score each of these criteria from 0 to 10. The bar is an overall mean of at least ${gate.minimumScore ?? '?'}, and no single criterion below ${gate.minimumCriterionScore ?? '?'}.`,
    ...scored.map((entry) => `  - ${entry.id}: ${entry.question}`),
  ];
  if (unproven.length) {
    lines.push(
      '',
      'Do NOT score these — the captures do not cover them, and they are already recorded as unproven:',
      ...unproven.map((entry) => `  - ${entry.id}`),
    );
  }
  const mustAddress = list(candidate.gate?.mustAddress);
  if (mustAddress.length) {
    lines.push(
      '',
      'A deterministic linter raised these warnings. You may disagree with any of them, but you must say something about each:',
      ...mustAddress.map((rule) => `  - ${rule}`),
    );
  }
  lines.push(
    '',
    'A "pass" means a professional studio would put its name on this. If it is competent but short of that, the answer is "rework", not a generous pass.',
    '',
    'Reply with JSON only, no prose around it, matching exactly:',
    '{',
    '  "verdict": "pass" | "rework" | "reject",',
    '  "model": "<the model you are, if you know it>",',
    '  "rationale": "<two or three sentences>",',
    `  "criterionScores": [${scored.map((entry) => `{"criterion": "${entry.id}", "score": <0-10>, "note": "<why>"}`).join(', ')}],`,
    '  "failingCriteria": ["<ids scoring below the floor>"],',
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

  return {
    candidateId: candidate.candidateId,
    verdict: raw.verdict,
    // Stamped here, from what this module is. Nothing reaching this function
    // can influence it.
    reviewedBy: { role: REVIEWER_ROLE, vendor: REVIEWER_VENDOR, model },
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    criterionScores: scores.map((entry) => ({ criterion: entry.criterion, score: Number(entry.score), note: entry.note ?? null })),
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

  const coverage = criterionCoverage(packet.criteria, candidate.captures);
  const images = list(candidate.captures).map((capture) => path.resolve(packetDir, capture.file));
  const absent = images.filter((file) => !fs.existsSync(file));
  if (absent.length) throw new Error(`The packet references ${absent.length} capture(s) it does not contain, starting with ${absent[0]}. A review of missing pictures is not a review.`);
  if (!images.length) throw new Error(`Candidate ${candidateId} has no captures. There is nothing to review.`);

  const prompt = buildPrompt({ packet, candidate, coverage });
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
