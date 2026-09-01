/**
 * Looking at unrelated builds side by side, which is the half the structural
 * diagnostic cannot do.
 *
 * `cross-build-diversity.mjs` reads the composition and the compiled design of
 * several builds and reports which signals take exactly one value across the
 * corpus. That is genuinely useful and it is deterministic, and it is blind to
 * the thing anybody actually means by "these all look the same". Two builds can
 * differ on every structural axis the registry names — different hero strategy,
 * different grid family, different action treatment — and still be immediately
 * recognisable as the same generated house style, because sameness lives in
 * proportion, colour temperature, spacing rhythm, type feeling and motif, and
 * none of those is an axis.
 *
 * So this prepares a **screenshot-level** review: it assembles the captures,
 * writes the prompt, and refuses to run over a corpus too small to mean
 * anything. It does not decide. Deciding whether two businesses that look
 * similar *should* look similar is a judgement, and a rule that made it would
 * be the arbitrary-difference rule this repository has already rejected twice.
 *
 * ## The rule this must not become
 *
 * Similarity is only a problem when it is unsupported by the businesses. Two
 * five-page marketing sites for two trades genuinely may share a silhouette,
 * and demanding they differ would produce difference for its own sake — which
 * is a worse failure than sameness, because it is sameness plus noise. Every
 * question below is therefore phrased as "is this difference/similarity
 * explained by the businesses?" rather than "are these different?".
 */

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * The smallest corpus over which the question means anything.
 *
 * Three, because two builds that resemble each other are an anecdote and the
 * finding this exists to produce — "the factory has a house style" — is a claim
 * about a population. Stated as a constant with a reason rather than left to a
 * caller, because a caller under deadline will pass two.
 */
export const MINIMUM_CORPUS = 3;

export const SAMENESS_QUESTIONS = Object.freeze([
  Object.freeze({
    id: 'shared-design-language',
    question: 'Viewed side by side, do these read as one design language applied to several businesses, or as several designs?',
    guard: 'Some shared language is expected — they came from one factory with one component vocabulary. The finding is whether a viewer would attribute them to one author rather than to one toolchain.',
  }),
  Object.freeze({
    id: 'repeated-motifs',
    question: 'Which specific motifs repeat across builds that had no business reason to share them? Name them.',
    guard: 'Name the motif and the builds. "They all feel samey" is not a finding anybody can act on; "all four open with a centred statement over a tinted band" is.',
  }),
  Object.freeze({
    id: 'silhouette',
    question: 'Squinting until the text is unreadable, do these have recognisably different silhouettes — different distributions of mass, density and rhythm down the page?',
    guard: 'This is the test structural axes pass and screenshots fail. Two builds can differ on every declared axis and squint identically.',
  }),
  Object.freeze({
    id: 'typography',
    question: 'Is the typography genuinely different between builds, or the same scale and feeling in different families?',
    guard: 'A different typeface at the same size, weight, measure and rhythm is the same typography. Judge the setting, not the face.',
  }),
  Object.freeze({
    id: 'section-rhythm',
    question: 'Do the builds pace their pages differently — different section lengths, different density changes, different relationships between successive screens?',
    guard: 'Identical vertical rhythm across unrelated businesses is the clearest single signal of a template, and it survives every axis change the registry can make.',
  }),
  Object.freeze({
    id: 'interaction-language',
    question: 'Where the businesses differ in kind, is the interaction language different in kind too?',
    guard: 'A law firm and a software product should not feel the same to use. Where two builds ARE the same kind of business, sameness here is not a finding.',
  }),
  Object.freeze({
    id: 'business-shaped',
    question: 'For each build: name one visual decision that is explained by that business and would be wrong for the others. If you cannot for a build, say so.',
    guard: 'The load-bearing question. A corpus where no build has such a decision is a corpus of one template, whatever the axes report.',
  }),
]);

/**
 * Assemble the review, or refuse it.
 *
 * Refuses rather than degrades: a sameness review over two builds would produce
 * an answer, and the answer would be worth nothing, and it would be quoted
 * later as though it were worth something.
 */
export function planCrossBuildVisualReview({ builds = [], viewport = 'desktop', route = '/' } = {}) {
  const usable = list(builds).filter((build) => list(build.captures).some((capture) => capture.viewport === viewport && capture.route === route));
  if (usable.length < MINIMUM_CORPUS) {
    throw new Error(
      `A cross-build sameness review needs at least ${MINIMUM_CORPUS} builds captured at ${route} / ${viewport}; this corpus offers ${usable.length}. `
      + 'Two builds that resemble each other are an anecdote, and the finding this produces is a claim about a population.',
    );
  }
  return {
    schemaVersion: 1,
    authority: 'cross-build-visual-sameness',
    viewport,
    route,
    builds: usable.map((build) => ({
      build: build.build,
      business: build.business ?? null,
      businessKind: build.businessKind ?? null,
      capture: list(build.captures).find((capture) => capture.viewport === viewport && capture.route === route),
    })),
    questions: SAMENESS_QUESTIONS,
  };
}

export function buildSamenessPrompt(plan) {
  const lines = [
    'You are looking at the home pages of several unrelated websites, side by side. They were produced by the same system for different businesses.',
    '',
    'You are NOT being asked whether they are different. You are being asked whether the ways they are similar are explained by the businesses they are for.',
    '',
    'Some shared language is expected and fine — they came from one toolchain with one component vocabulary. Difference for its own sake is worse than sameness: it is sameness plus noise. Two businesses of the same kind may legitimately look alike.',
    '',
    'The builds, in order:',
    ...plan.builds.map((entry, index) => `  ${index + 1}. ${entry.business ?? entry.build}${entry.businessKind ? ` — ${entry.businessKind}` : ''}`),
    '',
    'Answer each of these:',
    '',
  ];
  for (const question of plan.questions) {
    lines.push(`  ${question.id}`);
    lines.push(`    ${question.question}`);
    lines.push(`    ${question.guard}`);
    lines.push('');
  }
  lines.push(
    'Reply with JSON only:',
    '{',
    `  "answers": [${plan.questions.map((question) => `{"id": "${question.id}", "finding": "<what you saw>", "supportedByBusinesses": <true|false>}`).join(', ')}],`,
    '  "sharedMotifs": [{"motif": "<name it>", "builds": ["<which>"], "businessReason": "<why it might be legitimate, or null>"}],',
    '  "eachBuildIsShapedByItsBusiness": {"<build>": "<the decision, or null if you cannot name one>"},',
    '  "verdict": "distinct" | "shared-language-explained" | "shared-language-unexplained" | "one-template"',
    '}',
  );
  return lines.join('\n');
}

/**
 * What a returned answer is allowed to conclude.
 *
 * A verdict of `one-template` is a finding about the factory rather than about
 * any build, so it is reported and never converted into a gate here — the same
 * reason `anti-template-diagnostic.mjs` exits zero. The moment this blocks a
 * build it has invented a threshold no corpus has earned.
 */
export function summariseSameness(answer, plan) {
  const answers = list(answer?.answers);
  const unexplained = answers.filter((entry) => entry.supportedByBusinesses === false);
  const unshaped = Object.entries(answer?.eachBuildIsShapedByItsBusiness ?? {})
    .filter(([, decision]) => !decision)
    .map(([build]) => build);
  return {
    corpusSize: plan.builds.length,
    verdict: answer?.verdict ?? null,
    unexplainedSimilarities: unexplained.map((entry) => ({ id: entry.id, finding: entry.finding })),
    sharedMotifsWithoutReason: list(answer?.sharedMotifs).filter((motif) => !motif.businessReason),
    buildsWithNoBusinessShapedDecision: unshaped,
    // The one line worth putting in a report. A corpus where no build has a
    // decision its own business explains is a corpus of one template, and the
    // structural diagnostic cannot see it.
    headline: unshaped.length === plan.builds.length
      ? `No build in this corpus of ${plan.builds.length} carries a visual decision explained by its own business. That is one template with several palettes, whatever the structural axes report.`
      : `${plan.builds.length - unshaped.length} of ${plan.builds.length} builds carry at least one visual decision explained by their own business.`,
    decidesNothing: 'This is a diagnostic. It gates no build, because a threshold over a corpus this size would be a number chosen to look rigorous.',
  };
}
