#!/usr/bin/env node
/**
 * What the new scale can and cannot say about verdicts issued under the old one.
 *
 * PR #255 recorded three hand-built prototypes at means of 8.71, 8.56 and 8.67
 * against a bar of 8.5, and concluded that the visual ceiling is the factory's
 * constraints rather than the model. That conclusion may well be right. What it
 * cannot be is *established by those numbers*, and this tool exists to say why
 * in a form somebody can re-run rather than in a paragraph somebody has to
 * trust.
 *
 * ## The honest finding, stated before the code that produces it
 *
 * **The old scores cannot be converted into new ones.** Not "convert badly" —
 * cannot. Five of the thirteen criteria the rubric now asks were never put to
 * the reviewer at all: art direction, information architecture, typography
 * craft, interaction craft, and resistance to generic design language. There is
 * no defensible way to derive a score for a question nobody asked. Anything
 * this tool printed in those columns would be invention.
 *
 * So it does three things it can actually do:
 *
 *   1. **Map** the criteria that do correspond, and report those scores as what
 *      they are — answers to differently-worded questions, gathered under a
 *      prompt that disclosed the target.
 *   2. **Apply the ceilings** to what the verdicts themselves recorded. This is
 *      the load-bearing part: the reviewer's own defect list is evidence about
 *      the artifact, written by the reviewer, and the scale's consistency rules
 *      apply to it exactly as they would to a fresh review.
 *   3. **Report the evidence tier**, so a claim about coverage is checked
 *      rather than assumed.
 *
 * Run: node tooling/visual-scale-reevaluation.mjs [--json]
 */

import fs from 'node:fs';
import path from 'node:path';

import { evidenceCeiling } from './lib/codex-visual-reviewer.mjs';
import { overallCeiling, tierForMean, VISUAL_CRITERIA } from './lib/visual-rubric.mjs';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'examples/visual-scale/gold-reference-255.verdicts.json');

/**
 * How the v1 questions map onto the v2 ones.
 *
 * Recorded as a mapping with a `fidelity` rather than a lookup table, because
 * two of these are not the same question in different words. `coherence` asked
 * whether the parts read as one decision; `composition-pacing` asks about
 * rhythm, density, tension and the relationship between successive screens. A
 * 9 on the first is not a 9 on the second, and printing it as one would be the
 * quiet kind of dishonesty this whole exercise is trying to remove.
 */
const CRITERION_MAP = Object.freeze({
  'brand-fit': { to: 'brand-fit', fidelity: 'close', note: 'Substantially the same question.' },
  'visual-hierarchy': { to: 'visual-hierarchy', fidelity: 'partial', note: 'v1 asked whether the eye reaches the most important thing first — a threshold. v2 asks how well attention is controlled across the whole experience.' },
  coherence: { to: 'composition-pacing', fidelity: 'partial', note: 'v1 asked whether the parts read as one decision. v2 asks about rhythm, density variation, tension and release. Coherence is necessary for pacing and nowhere near sufficient.' },
  distinctiveness: { to: 'business-specificity', fidelity: 'partial', note: 'v1 asked "considered site or template with its colours changed?" — a two-way split. v2 asks whether the design could be re-skinned onto another company, which a considered site can still fail.' },
  credibility: { to: 'commercial-clarity', fidelity: 'partial', note: 'v1 asked about trust. v2 folds trust into proposition, navigation and next action.' },
  'conversion-clarity': { to: 'commercial-clarity', fidelity: 'close', note: 'Substantially the same question, merged with credibility.' },
  'imagery-suitability': { to: 'visual-material', fidelity: 'partial', note: 'v1 asked only about published photographs, and only of builds that had them. v2 asks whether the chosen material is the right material for the subject, of every build.' },
  'responsive-quality': { to: 'responsive-recomposition', fidelity: 'close', note: 'Substantially the same question, with the bar for 8+ now stated explicitly.' },
  'distinctive-moment': { to: 'memorability', fidelity: 'partial', note: 'v1 asked whether a *declared* moment landed. v2 asks the reviewer to name one unprompted, which is a harder question.' },
});

/** Criteria the v1 review never asked about at all. */
const NEVER_ASKED = VISUAL_CRITERIA
  .map((criterion) => criterion.id)
  .filter((id) => !Object.values(CRITERION_MAP).some((entry) => entry.to === id));

/**
 * Turn a recorded defect list into the observations the ceilings read.
 *
 * Conservative on purpose. An observation is only set where the reviewer's own
 * words state it, and the phrase that triggered it is recorded beside it so a
 * reader can disagree with the reading rather than with the result. Where the
 * verdicts are silent, the observation is left unset — which means no ceiling
 * applies, which is the generous direction.
 */
function observationsFrom(prototype) {
  const text = [
    ...prototype.recordedDefects.map((defect) => `${defect.criterion}: ${defect.detail}`),
    ...prototype.recordedStrengths,
  ].join(' \n ').toLowerCase();

  const observations = {};
  const evidence = [];
  const mark = (key, pattern, why) => {
    const match = text.match(pattern);
    if (match) {
      observations[key] = true;
      evidence.push({ observation: key, phrase: match[0].trim().slice(0, 160), why });
    }
  };

  mark('noSignatureMoment', /memorable through restraint rather than a uniquely ownable interaction/,
    'The reviewer said in terms that it could not name an ownable moment. That is the answer to the memorability question, not a missing input.');

  return { observations, evidence };
}

function reevaluate(prototype) {
  const mapped = Object.entries(prototype.recordedScores).map(([criterion, score]) => {
    const entry = CRITERION_MAP[criterion];
    return {
      v1Criterion: criterion,
      v2Criterion: entry?.to ?? null,
      recordedScore: score,
      fidelity: entry?.fidelity ?? 'unmapped',
      note: entry?.note ?? null,
    };
  });

  const { observations, evidence } = observationsFrom(prototype);
  const majors = prototype.recordedDefects.filter((defect) => defect.severity === 'major');

  /**
   * What the scale permits, given only what #255 itself recorded.
   *
   * `benchmarkGap` is UNASSESSED because no pairwise comparison was made — the
   * mechanism did not exist. That alone forecloses a 10, and it is the correct
   * answer rather than a technicality: nobody compared these against
   * benchmark-class work, so nobody knows.
   */
  const ceiling = overallCeiling({
    benchmarkGap: 'UNASSESSED',
    holisticTier: null,
    criterionScores: Object.entries(prototype.recordedScores).map(([criterion, score]) => ({ criterion, score })),
  });

  return {
    id: prototype.id,
    label: prototype.label,
    recordedMean: prototype.recordedMean,
    recordedFloor: prototype.recordedFloor,
    recordedVerdict: prototype.recordedVerdict,
    impliedTierFromOldMean: tierForMean(prototype.recordedMean)?.id ?? null,
    mapped,
    neverAsked: NEVER_ASKED,
    observations,
    observationEvidence: evidence,
    majorDefects: majors,
    permittedCeiling: ceiling.cap,
    ceilingReasons: ceiling.reasons,
    convertible: false,
    whyNotConvertible: `${NEVER_ASKED.length} of ${VISUAL_CRITERIA.length} criteria were never put to the reviewer (${NEVER_ASKED.join(', ')}). A mean over the nine that were asked is not a mean over thirteen, and inventing the missing five would make this report the thing it is measuring.`,
  };
}

export function runReevaluation(inputFile = INPUT) {
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  return {
    schemaVersion: 1,
    authority: 'visual-scale-reevaluation',
    source: input.source,
    scaleInForce: input.scaleInForce,
    neverAsked: NEVER_ASKED,
    prototypes: input.prototypes.map(reevaluate),
    /**
     * The evidence question, answered separately because it is the one thing
     * #255 did well and it deserves saying.
     */
    evidence: {
      note: 'All three prototypes captured five or six routes at desktop, tablet, mobile and wide. Under the new evidence rules that is the top tier and caps nothing.',
      tier: evidenceCeiling([
        { route: '/', viewport: 'desktop' }, { route: '/', viewport: 'mobile' },
        { route: '/work', viewport: 'desktop' }, { route: '/studio', viewport: 'desktop' },
        { route: '/contact', viewport: 'desktop' },
      ]),
    },
  };
}

function describe(report) {
  const lines = [
    '# Re-evaluating the #255 prototypes under the new scale',
    '',
    `Source: PR #${report.source.pr} (\`${report.source.branch}\`), observed ${report.source.observedAt}. Nothing on that branch was modified.`,
    '',
    '## The headline: these scores are not convertible',
    '',
    `The old review asked nine questions. The rubric asks thirteen. **${report.neverAsked.length} were never put to the reviewer at all**: \`${report.neverAsked.join('`, `')}\`.`,
    '',
    'There is no defensible way to score a question nobody asked, so this report does not produce new means. What it produces is what the new scale permits, given only what #255 itself wrote down.',
    '',
    `The old prompt also disclosed the bar: *"${report.scaleInForce.barDisclosedDetail}"*. Three prototypes returned 8.50, 8.56 and 8.71 against a disclosed target of 8.5. That is not evidence about the prototypes; it is evidence about the prompt.`,
    '',
    '## Per prototype',
    '',
  ];
  for (const prototype of report.prototypes) {
    lines.push(`### ${prototype.label}`, '');
    lines.push(`| | |`, `| --- | --- |`);
    lines.push(`| Recorded mean (9 criteria, undefined scale) | ${prototype.recordedMean} |`);
    lines.push(`| Recorded floor | ${prototype.recordedFloor} |`);
    lines.push(`| Recorded verdict | ${prototype.recordedVerdict} |`);
    lines.push(`| Tier that mean *would* imply | ${prototype.impliedTierFromOldMean} |`);
    lines.push(`| Major defects the reviewer itself recorded | ${prototype.majorDefects.length} |`);
    lines.push(`| **Ceiling the new scale permits** | **${prototype.permittedCeiling}** |`, '');
    lines.push('Why it is capped there:', '');
    for (const reason of prototype.ceilingReasons) lines.push(`- ${reason}`);
    if (prototype.majorDefects.length) {
      lines.push('', 'Major defects, in the reviewer\'s own words:', '');
      for (const defect of prototype.majorDefects) lines.push(`- **${defect.criterion}** — ${defect.detail}`);
    }
    if (prototype.observationEvidence.length) {
      lines.push('', 'Observations the review states outright:', '');
      for (const entry of prototype.observationEvidence) lines.push(`- \`${entry.observation}\` — "${entry.phrase}" ${entry.why}`);
    }
    lines.push('');
  }
  lines.push(
    '## Evidence',
    '',
    report.evidence.note,
    '',
    '## What follows',
    '',
    'The prototypes are very probably good work — the recorded strengths are specific and checkable, and the evidence behind them is the best in the repository. What cannot be said is that they were measured. Deciding where they actually sit needs a review under the new rubric, against a benchmark reference, by an independent vendor. That is an operator-authorised run, and it has not been performed.',
    '',
    '**The one thing this report does settle**: on the reviewers\' own recorded defect lists, and with no pairwise comparison ever made, none of the three can be a 10 under the new scale. `benchmarkGap` is UNASSESSED for all three, and that alone caps them at 9 before any judgement about the work is made.',
    '',
  );
  return lines.join('\n');
}

function main() {
  const report = runReevaluation();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const markdown = describe(report);
  console.log(markdown);
  const out = path.join(ROOT, 'examples/visual-scale/gold-reference-255.reevaluation.md');
  fs.writeFileSync(out, `${markdown}`);
  console.error(`\nWritten to ${path.relative(ROOT, out)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
