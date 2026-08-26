/**
 * Deterministic DesignLint.
 *
 * The point of this is cost and reliability, in that order. A visual critic
 * asked to look at a rendered page will happily spend tokens reporting that an
 * accent is unreadable or that four sections in a row look the same — things a
 * rule can decide from the compiled design and the composition, for nothing,
 * every time, with the same answer. Everything a rule can settle should be
 * settled before a model is asked to look.
 *
 * The rules here are deliberately few and deliberately checkable. Each one
 * describes a defect the current template and composer can actually produce,
 * and none of them turns a matter of taste into an absolute. Where judgement is
 * genuinely required, the report says so by naming an AI review candidate
 * rather than by inventing a threshold — a scoped list for the critic is worth
 * more than a rule that is wrong a third of the time.
 *
 * Severity is not decoration:
 *
 *   violation      — a defect. Something is unreadable, or an invariant broke.
 *   warning        — probably wrong, and worth a person's attention.
 *   recommendation — a suggestion. Being ignored is a legitimate outcome.
 */

import { contrastRatio } from './design-choices.mjs';

export const SEVERITIES = Object.freeze(['violation', 'warning', 'recommendation']);
export const MINIMUM_TEXT_CONTRAST = 4.5;

/**
 * How many sections may be presented identically in a row before a page reads
 * as one list repeated. Three is the point at which a rhythm has stopped.
 */
const REPETITION_LIMIT = 3;

/** Every section's first action renders as the primary one, so a page with several has none. */
const PRIMARY_ACTION_LIMIT = 2;

/** A page long enough that never changing ground is worth mentioning. */
const UNIFORM_RHYTHM_LIMIT = 5;

const HEX = /^#[0-9a-fA-F]{6}$/;

function channels(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

/**
 * Resolve the one `color-mix` the token set relies on.
 *
 * `--color-accent-soft` is 9% accent in the page colour, and it is the ground a
 * section's own text sits on. Working it out here is what lets the contrast
 * rule check the ground a build actually renders rather than assuming white.
 */
export function mixHex(foreground, background, percent) {
  if (!HEX.test(foreground) || !HEX.test(background)) return null;
  const [a, b] = [channels(foreground.toLowerCase()), channels(background.toLowerCase())];
  const parts = a.map((value, index) => Math.round((value * percent) + (b[index] * (1 - percent))));
  return `#${parts.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The token defaults the template declares, so a rule reads the values a build
 * renders rather than the subset the design system compiles.
 */
export function templateTokenDefaults(tokenSourceCss) {
  const defaults = {};
  for (const match of String(tokenSourceCss).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) defaults[match[1]] = match[2].trim();
  return defaults;
}

function finding(rule, severity, detail, extra = {}) {
  return { rule, severity, detail, ...extra };
}

/**
 * The accent has to be readable on the grounds it is actually printed on.
 *
 * An eyebrow, a rule and a link are all set in `--color-accent` over either the
 * page or the tinted alternate ground. The design contract already refuses an
 * accent that cannot carry its own label, but that check is against white, and
 * neither of these grounds is white. The tinted one is 9% of the accent itself
 * mixed into the page, which is enough to cost a real amount of contrast: 292
 * of the accents that pass the input gate fail on it, and they are ordinary
 * brand blues and teals — exactly what reading a company's own site now yields.
 */
function accentContrast(tokens) {
  const accent = tokens['--color-accent'];
  const page = tokens['--color-page'];
  if (!HEX.test(String(accent)) || !HEX.test(String(page))) return [];

  const grounds = [{ name: '--color-page', value: page }];
  const soft = mixHex(accent, page, 0.09);
  if (soft && tokens['--section-alt-ground'] === 'var(--color-accent-soft)') grounds.push({ name: '--color-accent-soft', value: soft });

  return grounds.flatMap((ground) => {
    const ratio = contrastRatio(accent.toLowerCase(), ground.value.toLowerCase());
    if (ratio >= MINIMUM_TEXT_CONTRAST) return [];
    return [finding('accent-contrast', 'violation', `Accent ${accent} contrasts ${ratio.toFixed(2)}:1 against ${ground.name}, below the ${MINIMUM_TEXT_CONTRAST}:1 an eyebrow or link set in it needs.`, { token: '--color-accent', ground: ground.name, ratio: Number(ratio.toFixed(2)) })];
  });
}

/** A build that moves must still honour a visitor who asked it not to. */
function reducedMotion(spec, tokenSourceCss) {
  const contract = spec?.artDirection?.motion;
  if (contract && contract.reducedMotionRequired !== true) {
    return [finding('reduced-motion-required', 'violation', `Motion intensity ${contract.intensity} does not require reduced-motion handling.`)];
  }
  if (typeof tokenSourceCss === 'string' && !/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(tokenSourceCss)) {
    return [finding('reduced-motion-required', 'violation', 'The template token source no longer carries a prefers-reduced-motion block.')];
  }
  return [];
}

function pagesOf(composition) {
  const sections = new Map((composition?.sections ?? []).map((section) => [section.id, section]));
  return (composition?.pages ?? []).map((page) => ({
    page,
    sections: (page.sectionIds ?? []).map((id) => sections.get(id)).filter(Boolean),
  }));
}

/**
 * A page that presents four things the same way in a row has stopped having a
 * rhythm. This reads the composition rather than a picture, so it costs nothing
 * and cannot disagree with itself between runs.
 */
function repetitivePresentation(composition) {
  const findings = [];
  for (const { page, sections } of pagesOf(composition)) {
    let run = [];
    const flush = () => {
      if (run.length >= REPETITION_LIMIT) {
        findings.push(finding('repetitive-section-presentation', 'warning', `${page.path} shows ${run.length} consecutive sections as ${run[0].type}/${run[0].variant}.`, { pageId: page.id, sectionIds: run.map((section) => section.id) }));
      }
      run = [];
    };
    for (const section of sections) {
      if (run.length && run[0].type === section.type && run[0].variant === section.variant) run.push(section);
      else { flush(); run = [section]; }
    }
    flush();
  }
  return findings;
}

/**
 * Every section's first action renders as the primary one. A page carrying
 * several is a page asking a visitor to decide what matters, which is the job
 * the page was supposed to do.
 */
function competingActions(composition) {
  const findings = [];
  for (const { page, sections } of pagesOf(composition)) {
    const carrying = sections.filter((section) => (section.actions ?? []).length > 0);
    if (carrying.length <= PRIMARY_ACTION_LIMIT) continue;
    findings.push(finding('competing-primary-actions', 'warning', `${page.path} renders ${carrying.length} primary actions, so none of them is the primary action.`, { pageId: page.id, sectionIds: carrying.map((section) => section.id) }));
  }
  return findings;
}

/**
 * A long page that never changes ground. A recommendation rather than a defect:
 * an internal tool is deliberately flat, and being ignored here is a legitimate
 * outcome rather than a failure to comply.
 */
function uniformRhythm(spec, composition) {
  if (spec?.artDirection?.dimensions?.layoutVariance !== 'uniform') return [];
  return pagesOf(composition)
    .filter(({ sections }) => sections.length >= UNIFORM_RHYTHM_LIMIT)
    .map(({ page, sections }) => finding('uniform-page-rhythm', 'recommendation', `${page.path} runs ${sections.length} sections on one ground. Consider whether this surface earns its uniform layout variance.`, { pageId: page.id }));
}

/**
 * What a rule deliberately does not judge.
 *
 * Naming these is the other half of the point. A critic handed "review this
 * page" re-derives what the rules already settled; a critic handed this list
 * spends its budget on the questions that actually need judgement.
 */
export function aiReviewCandidates(spec, composition) {
  const candidates = [
    { id: 'brand-fit', question: `Does the build read as the business it is for, given a ${spec?.brand?.typography?.voice} voice and a ${spec?.brand?.accent?.origin} accent?` },
    { id: 'visual-hierarchy', question: 'Does the eye reach the most important thing on each page first?' },
    { id: 'distinctiveness', question: 'Does this look like a considered site for this business, or like a template with its colours changed?' },
  ];
  if ((composition?.sections ?? []).some((section) => (section.assetIds ?? []).length)) {
    candidates.push({ id: 'imagery-suitability', question: 'Do the published photographs suit the business, and are they framed well?' });
  }
  return candidates;
}

/**
 * Lint a build from what it compiled and what it composed.
 *
 * No browser, no screenshot, no model. This runs before evidence capture is
 * worth paying for, and its report travels with the evidence so a reviewer sees
 * what was already settled deterministically.
 */
export function compileDesignLintReport({ spec, composition, tokenSourceCss = '', compositionHash = null } = {}) {
  if (!spec?.tokens) throw new Error('DesignLint needs a compiled DesignSystemSpec.');
  const tokens = { ...templateTokenDefaults(tokenSourceCss), ...spec.tokens };

  const findings = [
    ...accentContrast(tokens),
    ...reducedMotion(spec, tokenSourceCss),
    ...repetitivePresentation(composition),
    ...competingActions(composition),
    ...uniformRhythm(spec, composition),
  ];

  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, findings.filter((entry) => entry.severity === severity).length]));
  return {
    schemaVersion: 1,
    authority: 'design-contract',
    compositionHash,
    findings,
    counts,
    // A build with a violation should not be sent to a visual critic to be
    // told what a rule already said.
    clean: counts.violation === 0,
    aiReviewCandidates: aiReviewCandidates(spec, composition),
  };
}
