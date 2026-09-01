/**
 * The scale, and what its numbers mean.
 *
 * This module exists because of a specific failure. The visual gate asked a
 * critic to "score each criterion from 0 to 10" and then told it the bar was
 * 8.5 — and supplied no definition of any number on the way there. A model
 * given an undefined ten-point scale and a stated target does the obvious
 * thing: it clusters everything competent between 8 and 9. Three hand-built
 * prototypes duly returned means of 8.50, 8.67 and 8.71 while their own defect
 * lists named a non-persistent enquiry action, dense unreadable mobile
 * metadata, and a visibly fictional email address. Those are not the defect
 * lists of benchmark-class work, and the scores said otherwise because the
 * scores were not measuring anything.
 *
 * So the fix is not a higher bar. A stricter number against an undefined scale
 * is still an undefined scale. The fix is to define the scale, define what
 * evidence each level requires, and make the top of it cost something.
 *
 * Four mechanisms, and they are deliberately different in kind:
 *
 *   1. `SCORE_BANDS` — anchored semantics. Every integer from 0 to 10 has a
 *      written meaning, and the critic is shown all of them. This is the
 *      largest single change and probably the one doing most of the work.
 *
 *   2. `CEILINGS` — qualitative caps. Certain observations are incompatible
 *      with certain scores: a mobile view that is the desktop one stacked
 *      cannot be 8 on responsive recomposition, whatever else is true. These
 *      are applied to what the reviewer *observed*, never guessed at from
 *      pixels by this module.
 *
 *   3. `benchmarkGap` and the pairwise comparison — an external reference
 *      point, so the top of the scale is anchored to something outside this
 *      repository's opinion of itself.
 *
 *   4. `whyNotHigher` — an obligation. A criterion scored 8 or above must say
 *      what is holding it back from the next level, and a 10 must say what
 *      makes it benchmark-class rather than merely excellent. A reviewer who
 *      cannot answer has not made the distinction it is claiming to have made.
 *
 * ## What this module deliberately does not do
 *
 * It does not look at a page. Nothing here inspects markup, CSS or a
 * screenshot, and nothing here decides that a gradient or a rounded card is
 * bad. Every judgement input arrives as an observation a reviewer made; this
 * module only decides what follows from it arithmetically and what a number is
 * allowed to mean. Encoding taste as a rule would replace one template with
 * another, which is the failure mode this whole programme is trying to escape.
 */

const list = (value) => (Array.isArray(value) ? value : []);

/* ------------------------------------------------------------------------ *
 * The scale
 * ------------------------------------------------------------------------ */

/**
 * Anchored score semantics, one entry per integer.
 *
 * Every one of these is shown to the reviewer. That is the point: the previous
 * prompt showed none of them, and the numbers that came back were the model's
 * own habits rather than this repository's meaning.
 *
 * `requiresPositiveEvidence` marks the levels that cannot be reached by the
 * absence of defects. Below it, "nothing is wrong" is a reasonable way to
 * arrive at a score. At 9 and 10 it is not: an unremarkable page with no
 * visible flaw is a 7, and calling it a 10 is the exact inflation this scale
 * exists to prevent.
 */
export const SCORE_BANDS = Object.freeze([
  Object.freeze({ score: 0, label: 'not designed', meaning: 'Fundamentally unusable, or not meaningfully designed at all.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 1, label: 'severely broken', meaning: 'Severely broken. Layout, legibility or function has failed in a way any viewer would notice immediately.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 2, label: 'very poor', meaning: 'Very poor. Recognisably a website, and actively working against the business it represents.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 3, label: 'weak amateur', meaning: 'Weak amateur output. Made by somebody without training, and it shows throughout.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 4, label: 'below professional', meaning: 'Below professional standard. A paying client would send this back.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 5, label: 'mediocre / template-like', meaning: 'Mediocre. Generic or template-like: it functions, and nothing about it was decided for this business. A theme with its colours changed lands here.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 6, label: 'competent commercial', meaning: 'Competent commercial work. It works and it is not embarrassing. Visually ordinary; a viewer would not remember it.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 7, label: 'professional', meaning: 'Professional. A capable designer or developer could ship this without embarrassment. Considered, but not distinguished — this is where "well made and unremarkable" belongs, and it is a respectable place to be.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 8, label: 'strong professional', meaning: 'Strong professional or strong agency work. Clearly authored rather than assembled, visibly refined, with relatively few weaknesses. A good studio would show this to a client.', requiresPositiveEvidence: false }),
  Object.freeze({ score: 9, label: 'exceptional', meaning: 'Exceptional. Senior studio output with real originality, craft, business specificity and responsive quality. Would stand out positively in a strong professional portfolio. Requires demonstrated strengths, not merely an absence of faults.', requiresPositiveEvidence: true }),
  Object.freeze({ score: 10, label: 'benchmark-class', meaning: 'Extraordinary. Benchmark-class: exceptionally authored, memorable, sophisticated and fully resolved, comparable in quality of decision-making — not in style — to the strongest contemporary digital design work. No meaningful weakness is visible. This is rare and is expected to be rare.', requiresPositiveEvidence: true }),
]);

export const SCORE_BAND_BY_VALUE = Object.freeze(Object.fromEntries(SCORE_BANDS.map((band) => [band.score, band])));

/** The level at and above which a score must be argued for rather than defaulted into. */
export const POSITIVE_EVIDENCE_FLOOR = 9;

/** The level at and above which "what stops this being higher?" must be answered. */
export const WHY_NOT_HIGHER_FLOOR = 8;

/**
 * Decimal discipline.
 *
 * A reviewer writing 9.4 rather than 9.5 is not making a distinction it could
 * defend; it is performing precision. Half points are as fine as this scale
 * resolves, because the difference between 9 and 9.5 is already a difficult
 * argument and the difference between 9.4 and 9.6 is not an argument at all.
 *
 * Enforced rather than rounded. Rounding a 9.4 to 9.5 silently would hide that
 * a reviewer was working to a resolution the scale does not support.
 */
export const SCORE_INCREMENT = 0.5;

export function isPermittedScore(value) {
  if (!Number.isFinite(value) || value < 0 || value > 10) return false;
  return Math.abs(value / SCORE_INCREMENT - Math.round(value / SCORE_INCREMENT)) < 1e-9;
}

export function assertPermittedScore(value, context = 'a criterion') {
  if (!isPermittedScore(value)) {
    throw new Error(
      `${context} is scored ${String(value)}. Scores run 0 to 10 in steps of ${SCORE_INCREMENT}. `
      + 'A finer number claims a distinction this scale cannot defend: the gap between 9 and 9.5 is already a hard argument, and the gap between 9.4 and 9.6 is not one at all.',
    );
  }
  return value;
}

/**
 * Which band a score belongs to.
 *
 * A half point takes the meaning of the integer below it — 8.5 is a strong-8,
 * not a weak-9 — because that is how a reviewer reaches for it, and because
 * letting 8.5 inherit the 9 band's positive-evidence obligation would make the
 * half point the cheapest way to claim exceptional.
 */
export function bandFor(score) {
  return SCORE_BAND_BY_VALUE[Math.floor(score)] ?? null;
}

/* ------------------------------------------------------------------------ *
 * The criteria
 * ------------------------------------------------------------------------ */

/**
 * What a critic is asked, at a resolution that separates good from exceptional.
 *
 * The v1 set asked nine questions, most of them shaped so that "yes" is the
 * answer for anything competent: *does the eye reach the most important thing
 * first?* A page where it does is not thereby exceptional, but a reviewer that
 * has just answered yes is being invited to write 9.
 *
 * So every question here is written as a **gradient** rather than a threshold,
 * and each carries an explicit `separates` line naming what distinguishes the
 * upper levels on this particular criterion. That line is the highest-value
 * text in the file: it is the difference between asking "is the typography
 * good?" and asking "is the typography good *enough to be a 9*, and what would
 * that look like?".
 *
 * `appliesTo` is kept from v1 and matters more now that there are more
 * criteria. Padding the list with questions an artifact cannot answer inflates
 * nothing and dilutes everything: a dense internal tool judged on conversion
 * is being marked on a question nobody asked it.
 */
export const VISUAL_CRITERIA = Object.freeze([
  Object.freeze({
    id: 'art-direction',
    title: 'Art direction and visual authorship',
    appliesTo: 'all',
    question: 'Does this feel deliberately conceived, or assembled from competent components? Is there a visual thesis — a point of view a designer could state in a sentence — and does the page hold to it with confidence and restraint?',
    separates: 'A 7 is coherent and unremarkable: correct decisions, no argument. An 8 has a visible point of view carried consistently. A 9 has a thesis strong enough that removing it would leave a different, worse site, with restraint and expressive moments both deployed on purpose. A 10 is authored work whose visual language could not be lifted onto another brief without falling apart.',
    ceilingNotes: 'A polished template is not authorship however well finished it is.',
  }),
  Object.freeze({
    id: 'business-specificity',
    title: 'Business and product specificity',
    appliesTo: 'all',
    question: 'Could this exact experience be re-skinned for a different company by changing the words, the logo and the palette? Or does the design itself emerge from this business — its work, evidence, proposition, audience and assets?',
    separates: 'A 5 is a template with the colours changed. A 7 is generic structure carrying specific content. An 8 makes structural decisions the business drove — sections, orderings and components that exist because of what this company does. A 9 or 10 has a design that would be actively wrong for anyone else. Colour and copy changes are not specificity.',
    ceilingNotes: 'If the site could be another business with its logo removed, this cannot reach 8.',
  }),
  Object.freeze({
    id: 'information-architecture',
    title: 'Information architecture and content editing',
    appliesTo: 'all',
    question: 'Did somebody make intelligent decisions about what belongs on Home, what deserves its own route, what is previewed, what is omitted, what is primary and what is supporting? Is detailed information where a reader would look for it?',
    separates: 'A 6 puts everything on one long page in a defensible order. A 7 routes sensibly. An 8 shows evidence of editing — things left out, things promoted, previews that earn their click. A 9 has an architecture that makes the business easier to understand than its own material does. More content must not mean longer pages.',
  }),
  Object.freeze({
    id: 'visual-hierarchy',
    title: 'Visual hierarchy',
    appliesTo: 'all',
    question: 'How well is attention controlled? Does priority establish itself immediately, does it suit each page\'s purpose, does relative importance visibly change through the experience, and are the key moments allowed to dominate?',
    separates: 'Headings larger than body text is a 5, not a 7. A 7 has a clear first read on every page. An 8 modulates hierarchy by page purpose. A 9 controls the whole sequence of attention, including where it deliberately releases. A page where everything is well-made and equally weighted scores low here however good the parts.',
  }),
  Object.freeze({
    id: 'typography',
    title: 'Typography craft',
    appliesTo: 'all',
    question: 'Judge scale, contrast, hierarchy, measure, line-height, weight, tracking, the relationship between display and body type, the craft of small text and metadata, responsive type, and whether type is used as compositional material rather than as labelling.',
    separates: 'Readable and consistent is a 6. A 7 has a considered scale and sane measure. An 8 shows craft in the small text — metadata, captions, labels — not only the headline. A 9 uses type as material: the typography is doing compositional work and the details reward inspection. Merely competent typography cannot reach 9.',
    ceilingNotes: 'Competent-but-unremarkable typography caps at 8.',
  }),
  Object.freeze({
    id: 'composition-pacing',
    title: 'Composition and pacing',
    appliesTo: 'all',
    question: 'Judge rhythm, scale and density variation, tension and release, section transitions, alignment, balance, the use of symmetry and asymmetry, and the relationship between successive screens.',
    separates: 'Ten competent sections with identical vertical rhythm is a 5 or 6 regardless of how good each one is. A 7 varies rhythm sensibly. An 8 paces the page — density changes, scale changes, sections relate to their neighbours. A 9 composes the whole scroll as one sequence with deliberate tension and release.',
  }),
  Object.freeze({
    id: 'visual-material',
    title: 'Visual material and product representation',
    appliesTo: 'all',
    question: 'Is the chosen visual material the right material for this subject — photography, product UI, data, diagrams, charts, illustration, typography, video or a graphic system? Judge cropping, scale, sequencing, placement, art direction and relationship to the content.',
    separates: 'A 6 has adequate material adequately placed. An 8 has material chosen because it is the right way to show this subject, and framed with care at every width. A 9 makes the material argue the business\'s case. A site with no imagery is not penalised where imagery would be wrong for it — judge the material it did choose, including type and space.',
  }),
  Object.freeze({
    id: 'interaction-craft',
    title: 'Interaction and micro-craft',
    appliesTo: 'all',
    question: 'Judge hover and focus behaviour, transitions, navigation behaviour, image interactions, buttons and links, subtle motion, interface feedback, and the consistency of small decisions.',
    separates: 'Working states are a 6. A 7 is consistent. An 8 shows deliberate small decisions that a careless build would have got wrong. A 9 has interaction craft a practitioner would notice and admire. Motion is not craft: an animated generic site scores no higher here than a still one. Judge only what the evidence actually shows, and say so if states were not captured.',
  }),
  Object.freeze({
    id: 'responsive-recomposition',
    title: 'Responsive recomposition',
    appliesTo: 'all',
    question: 'Is the narrow rendering a designed composition in its own right? Judge content prioritisation, regrouping, image cropping, typography, navigation, density, interaction, ordering, metadata and CTA position at mobile width.',
    separates: 'Desktop, then narrower desktop, then stacked desktop is a 5 to 7 no matter how tidy it is. An 8 requires evidence of decisions made specifically for the phone — different ordering, different crops, different density, something regrouped. A 9 has a mobile composition somebody would be happy to have designed on its own.',
    ceilingNotes: 'If mobile is merely the desktop layout stacked, this cannot reach 8.',
  }),
  Object.freeze({
    id: 'brand-fit',
    title: 'Brand and emotional fit',
    appliesTo: 'all',
    question: 'Does the visual language feel correct for this organisation and its audience? A technically impressive interface can still be wrong for the business it represents.',
    separates: 'Inoffensive and plausible is a 6. A 7 is appropriate. An 8 is recognisably right for this business rather than merely not wrong. A 9 has a visual language that would read as this organisation with the name removed.',
  }),
  Object.freeze({
    id: 'commercial-clarity',
    title: 'Commercial and product clarity',
    appliesTo: 'public',
    question: 'Is the proposition clear? Judge navigation clarity, the next action, trust, product understanding and comprehension. Premium does not mean obscure.',
    separates: 'A beautiful site that communicates nothing fails here regardless of its composition, and that failure is not redeemed by the visual criteria. A 7 is clear. An 8 makes the proposition and the next step effortless at every point a visitor might be ready. A 9 makes the business easier to buy from than its competitors\' sites do.',
  }),
  Object.freeze({
    id: 'ai-slop-resistance',
    title: 'Resistance to generic AI design language',
    appliesTo: 'all',
    question: 'Does this carry the fingerprints of generated design? Look for, where unjustified: vague giant hero statements, meaningless eyebrow text, gradient headline treatment, icon-in-rounded-square feature triplets, pill overuse, rounded-card soup, fake logo walls, generic KPI rows, "innovation" messaging, glowing blobs, decorative grid backgrounds, generic dashboard mockups, dark closing CTA slabs, identical section padding, excessive centring, every concept placed inside a card, stock phrasing, and premium minimalism produced mainly by empty space. For each pattern you see, ask whether it has a strong reason to exist here.',
    separates: 'This criterion is about justification, not about the patterns themselves. A justified pill is fine; twenty default pills are not. A high score means the design\'s choices are traceable to the business rather than to a house style shared by every generated site. A site built almost entirely from these motifs scores 3 or below however cleanly it is executed.',
    ceilingNotes: 'Scored high only where the visual decisions have reasons outside "this is what these sites look like".',
  }),
  Object.freeze({
    id: 'memorability',
    title: 'Memorability and signature experience',
    appliesTo: 'all',
    question: 'Having viewed this, can you describe a specific moment, interaction, composition or content experience that belongs to it and to no other site? Name it if so.',
    separates: 'If you cannot name one, this is 6 or below and the site cannot be exceptional overall. A 7 has something mildly distinguishing. An 8 has a moment worth describing. A 9 has one that suits the business rather than decorating it. A 10 is unmistakable: you would recognise a screenshot of it a month later.',
    ceilingNotes: 'No nameable signature moment caps this at 6.',
  }),
]);

export const CRITERION_IDS = Object.freeze(VISUAL_CRITERIA.map((criterion) => criterion.id));

/**
 * The criteria a particular artifact is judged on.
 *
 * `publishesImagery` no longer gates a criterion. `visual-material` asks what
 * material the site chose and whether it was the right choice, which is a
 * question an image-free site answers rather than skips — and the old shape
 * meant an imagery-led build was scored on nine criteria while a typographic
 * one was scored on eight, so the two were never on the same scale. #255 was
 * measured that way, on its strongest criterion.
 */
export function criteriaFor({ projectType } = {}) {
  const isPublic = ['marketing-site', 'content-site'].includes(projectType);
  return VISUAL_CRITERIA.filter((criterion) => criterion.appliesTo === 'all' || (criterion.appliesTo === 'public' && isPublic))
    .map((criterion) => ({ ...criterion }));
}

/* ------------------------------------------------------------------------ *
 * Ceilings
 * ------------------------------------------------------------------------ */

/**
 * Observations that are incompatible with a score.
 *
 * Every one of these is keyed to something the **reviewer reports observing**,
 * never to something this module detects. That distinction is the whole design:
 * `templateDerived` is a judgement a person or a model makes by looking, and
 * this module's only job is to refuse the arithmetic that would let a site be
 * called exceptional on art direction while its own review says it is a
 * template.
 *
 * The mechanism is principled rather than arbitrary — each cap is the score
 * band's own wording applied to the observation. `SCORE_BANDS[9]` says a 9 has
 * "real originality"; an artifact the reviewer has just called template-derived
 * cannot have it. The cap is not a new opinion, it is consistency enforcement.
 */
export const CEILINGS = Object.freeze([
  Object.freeze({
    id: 'template-derived',
    observation: 'templateDerived',
    criterion: 'art-direction',
    ceiling: 8,
    reason: 'A site the reviewer has identified as template-derived cannot demonstrate the originality a 9 asserts. Authorship and derivation are the same axis.',
  }),
  Object.freeze({
    id: 'stacked-mobile',
    observation: 'mobileIsStackedDesktop',
    criterion: 'responsive-recomposition',
    ceiling: 7,
    reason: 'A mobile view the reviewer has described as the desktop layout stacked has not been recomposed. An 8 here requires decisions made for the phone.',
  }),
  Object.freeze({
    id: 'interchangeable-business',
    observation: 'interchangeableBusiness',
    criterion: 'business-specificity',
    ceiling: 7,
    reason: 'If the reviewer judges the site could be another business with its logo removed, the design did not emerge from this one.',
  }),
  Object.freeze({
    id: 'no-signature-moment',
    observation: 'noSignatureMoment',
    criterion: 'memorability',
    ceiling: 6,
    reason: 'The criterion asks the reviewer to name a moment. Declining to name one is the answer, not a missing input.',
  }),
  Object.freeze({
    id: 'merely-competent-typography',
    observation: 'typographyMerelyCompetent',
    criterion: 'typography',
    ceiling: 8,
    reason: 'A 9 requires type doing compositional work. Competence is an 8 and a good place to be.',
  }),
  Object.freeze({
    id: 'generic-design-language',
    observation: 'genericDesignLanguage',
    criterion: 'ai-slop-resistance',
    ceiling: 5,
    reason: 'The reviewer reports the design language is the one shared by generated sites generally. That is the definition of the low end of this criterion.',
  }),
]);

/**
 * The gap to appropriate benchmark work.
 *
 * Ordered worst to best so a comparison is a comparison. `NONE` is not "we did
 * not look" — that is `UNASSESSED`, and it is deliberately a separate value,
 * because a missing comparison silently reading as "no gap" is precisely how a
 * top score gets issued by default.
 */
export const BENCHMARK_GAPS = Object.freeze(['LARGE', 'MATERIAL', 'SMALL', 'NONE']);
export const BENCHMARK_GAP_MEANING = Object.freeze({
  LARGE: 'Nowhere near benchmark class. The reference is stronger on most dimensions and by a wide margin.',
  MATERIAL: 'Clearly good, and clearly below benchmark quality. The reference is meaningfully stronger on several dimensions.',
  SMALL: 'The reference retains a modest advantage in refinement or craft. Close, not equal.',
  NONE: 'No meaningful quality gap is visible. The candidate holds its own against the reference on the dimensions compared.',
});

/** The gap above which a 10 is not available. */
export const MAXIMUM_GAP_FOR_TOP_SCORE = 'SMALL';

/**
 * Pairwise outcomes, from the candidate's point of view.
 *
 * Four values rather than three, because "the reference is better" and "the
 * reference is in a different league" are different findings and collapsing
 * them loses the one that matters at the top of the scale.
 */
export const PAIRWISE_OUTCOMES = Object.freeze([
  'candidate-stronger',
  'roughly-comparable',
  'reference-stronger',
  'reference-substantially-stronger',
]);

/** The dimensions a pairwise comparison is made on. */
export const PAIRWISE_DIMENSIONS = Object.freeze([
  'art-direction',
  'typography',
  'composition',
  'information-architecture',
  'responsive-design',
  'craft',
  'memorability',
  'business-specificity',
]);

/**
 * Holistic quality tiers.
 *
 * Asked of the reviewer directly, and deliberately not derived from the mean.
 * An arithmetic average of thirteen numbers is a diagnostic, not a verdict:
 * eight strong criteria and a fatal one average well, and so does a site that
 * is 8 everywhere because the reviewer could not find anything to complain
 * about. The tier catches the second case, which the floor does not.
 */
export const QUALITY_TIERS = Object.freeze([
  Object.freeze({ id: 'broken', rank: 1, indicativeRange: [0, 2], meaning: 'Broken or not meaningfully designed.' }),
  Object.freeze({ id: 'weak', rank: 2, indicativeRange: [2, 4.5], meaning: 'Weak amateur work, below professional standard.' }),
  Object.freeze({ id: 'generic', rank: 3, indicativeRange: [4.5, 6], meaning: 'Generic or template-like. Functions; nothing was decided for this business.' }),
  Object.freeze({ id: 'competent', rank: 4, indicativeRange: [6, 7], meaning: 'Competent commercial work. Works, visually ordinary.' }),
  Object.freeze({ id: 'professional', rank: 5, indicativeRange: [7, 8], meaning: 'Professional. Shippable without embarrassment; not distinguished.' }),
  Object.freeze({ id: 'strong-professional', rank: 6, indicativeRange: [8, 9], meaning: 'Strong professional or agency work. Clearly authored and refined.' }),
  Object.freeze({ id: 'exceptional', rank: 7, indicativeRange: [9, 9.5], meaning: 'Exceptional. Senior studio output that would stand out in a strong portfolio.' }),
  Object.freeze({ id: 'benchmark-class', rank: 8, indicativeRange: [9.5, 10], meaning: 'Benchmark-class. Comparable in quality of decision-making to the strongest contemporary work.' }),
]);

export const QUALITY_TIER_IDS = Object.freeze(QUALITY_TIERS.map((tier) => tier.id));
export const TIER_BY_ID = Object.freeze(Object.fromEntries(QUALITY_TIERS.map((tier) => [tier.id, tier])));

/**
 * The tier a mean score sits in, for comparison against the reviewer's own.
 *
 * Not authoritative over the reviewer, and never overwrites it. Its whole
 * purpose is to be *different* sometimes: a mean of 8.7 beside a holistic
 * reading of `strong-professional` is a finding, and forcing the two to agree
 * would delete it.
 */
export function tierForMean(mean) {
  if (!Number.isFinite(mean)) return null;
  const found = QUALITY_TIERS.find((tier) => mean >= tier.indicativeRange[0] && mean < tier.indicativeRange[1]);
  return found ?? QUALITY_TIERS[QUALITY_TIERS.length - 1];
}

/* ------------------------------------------------------------------------ *
 * Applying it
 * ------------------------------------------------------------------------ */

/**
 * Apply the observed ceilings to a set of criterion scores.
 *
 * Returns what was capped and why rather than quietly lowering numbers. A
 * reviewer whose 9 became a 7 is entitled to see which observation did it, and
 * a later reader is entitled to see that the raw judgement and the recorded
 * score differ.
 */
export function applyCeilings(criterionScores, observations = {}) {
  const applied = [];
  const scores = list(criterionScores).map((entry) => {
    const caps = CEILINGS.filter((ceiling) => ceiling.criterion === entry.criterion && observations[ceiling.observation] === true);
    if (!caps.length) return { ...entry };
    const tightest = caps.reduce((lowest, ceiling) => (ceiling.ceiling < lowest.ceiling ? ceiling : lowest));
    if (Number(entry.score) <= tightest.ceiling) return { ...entry };
    applied.push({
      criterion: entry.criterion,
      ceilingId: tightest.id,
      observation: tightest.observation,
      reviewerScore: Number(entry.score),
      cappedTo: tightest.ceiling,
      reason: tightest.reason,
    });
    return { ...entry, score: tightest.ceiling, reviewerScore: Number(entry.score), cappedBy: tightest.id };
  });
  return { criterionScores: scores, applied };
}

/**
 * Everything the scale refuses to let a verdict claim.
 *
 * Collected as findings rather than thrown one at a time, because a reviewer
 * that got three things wrong should be told three things rather than made to
 * discover them in sequence.
 */
export function auditVerdictAgainstScale(verdict, { criteria = null } = {}) {
  const problems = [];
  const scores = list(verdict?.criterionScores);

  for (const entry of scores) {
    const value = Number(entry?.score);
    if (!isPermittedScore(value)) {
      problems.push({
        kind: 'score-resolution',
        criterion: entry?.criterion ?? null,
        detail: `${String(entry?.criterion)} is scored ${String(entry?.score)}; scores move in steps of ${SCORE_INCREMENT}.`,
      });
      continue;
    }

    // The obligation that fights inflation hardest, and the cheapest to check.
    if (value >= WHY_NOT_HIGHER_FLOOR && value < 10 && !String(entry?.whyNotHigher ?? '').trim()) {
      problems.push({
        kind: 'why-not-higher-missing',
        criterion: entry?.criterion ?? null,
        detail: `${String(entry?.criterion)} scores ${value} and does not say what prevents it reaching the next level. A reviewer who cannot name the shortfall has not made the distinction the score claims.`,
      });
    }
    if (value === 10 && !String(entry?.whyBenchmark ?? '').trim()) {
      problems.push({
        kind: 'benchmark-justification-missing',
        criterion: entry?.criterion ?? null,
        detail: `${String(entry?.criterion)} scores 10 and does not say what makes it benchmark-class rather than merely excellent. A 10 is a claim, and an unargued claim is not one.`,
      });
    }
    if (value >= POSITIVE_EVIDENCE_FLOOR && !list(entry?.positiveEvidence).filter((line) => String(line).trim()).length) {
      problems.push({
        kind: 'positive-evidence-missing',
        criterion: entry?.criterion ?? null,
        detail: `${String(entry?.criterion)} scores ${value} with no positive evidence recorded. At ${POSITIVE_EVIDENCE_FLOOR} and above a score must name demonstrated strengths; the absence of defects caps a score rather than maximising it.`,
      });
    }
  }

  if (criteria) {
    const expected = criteria.map((criterion) => criterion.id);
    const scored = new Set(scores.map((entry) => entry?.criterion));
    const missing = expected.filter((id) => !scored.has(id));
    const extra = [...scored].filter((id) => !expected.includes(id));
    if (missing.length) problems.push({ kind: 'criteria-missing', detail: `Not every scoped criterion was scored: ${missing.join(', ')}.` });
    if (extra.length) problems.push({ kind: 'criteria-extra', detail: `Criteria this artifact was not scoped against were scored: ${extra.join(', ')}.` });
  }

  const tier = verdict?.holisticTier ?? null;
  if (tier !== null && !QUALITY_TIER_IDS.includes(tier)) {
    problems.push({ kind: 'unknown-tier', detail: `Unknown holistic tier ${JSON.stringify(tier)}. It offers: ${QUALITY_TIER_IDS.join(', ')}.` });
  }
  const gap = verdict?.benchmarkGap ?? null;
  if (gap !== null && gap !== 'UNASSESSED' && !BENCHMARK_GAPS.includes(gap)) {
    problems.push({ kind: 'unknown-benchmark-gap', detail: `Unknown benchmarkGap ${JSON.stringify(gap)}. It offers: ${BENCHMARK_GAPS.join(', ')}, or UNASSESSED where no comparison was made.` });
  }

  return problems;
}

/**
 * What the scale says a verdict's top score may be.
 *
 * Three independent conditions, and a 10 needs all of them. Each exists
 * because of a specific way a 10 could otherwise be reached without meaning
 * anything:
 *
 *   - a benchmark comparison that found a material gap, because a candidate
 *     the reference beats repeatedly is not benchmark-class by definition;
 *   - a holistic tier below `benchmark-class`, because the reviewer's own
 *     overall reaction outranks the arithmetic on this question;
 *   - a criterion below 8, because "no meaningful visible weakness" is part of
 *     what a 10 asserts and a 6 somewhere is a visible weakness.
 *
 * Returned as a cap with reasons rather than as a refusal, so the caller can
 * record a strong verdict accurately instead of failing to record one.
 */
export function overallCeiling(verdict) {
  const reasons = [];
  let cap = 10;

  const gap = verdict?.benchmarkGap ?? 'UNASSESSED';
  if (gap === 'UNASSESSED') {
    cap = Math.min(cap, 9);
    reasons.push('No benchmark comparison was recorded. The top of this scale is defined by comparison with the strongest contemporary work, so a 10 is not available without one.');
  } else if (BENCHMARK_GAPS.indexOf(gap) < BENCHMARK_GAPS.indexOf(MAXIMUM_GAP_FOR_TOP_SCORE)) {
    cap = Math.min(cap, gap === 'LARGE' ? 7 : 8.5);
    reasons.push(`The benchmark gap is ${gap}: ${BENCHMARK_GAP_MEANING[gap]}`);
  }

  const tier = verdict?.holisticTier ?? null;
  if (tier && tier !== 'benchmark-class') {
    const ranked = TIER_BY_ID[tier];
    if (ranked) {
      cap = Math.min(cap, ranked.indicativeRange[1]);
      reasons.push(`The reviewer's holistic reading is ${tier}: ${ranked.meaning}`);
    }
  }

  const scores = list(verdict?.criterionScores).map((entry) => Number(entry.score)).filter(Number.isFinite);
  if (scores.length) {
    const lowest = Math.min(...scores);
    if (lowest < 8) {
      cap = Math.min(cap, 9);
      reasons.push(`The lowest criterion is ${lowest}. A 10 asserts no meaningful visible weakness, and anything below 8 on a scoped criterion is one.`);
    }
  }

  return { cap, reasons };
}

/**
 * The sentence a 10 commits its issuer to.
 *
 * Kept here rather than only in documentation so that the reviewer is shown the
 * exact claim it is making, and so a later reader can find the contract beside
 * the code that enforces it.
 */
export const TOP_SCORE_CONTRACT = [
  'A visual/product score of 10 means: exceptional benchmark-class digital work.',
  'The artifact demonstrates unusually strong visual authorship, business specificity, information architecture,',
  'typography, composition, responsive design and implementation craft. It contains no meaningful visible weakness,',
  'does not rely on generic AI design language, and does not appear clearly inferior when compared pairwise with',
  'appropriate leading contemporary reference work.',
].join(' ');
