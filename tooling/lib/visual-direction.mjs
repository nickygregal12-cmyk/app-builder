/**
 * Visual directions — Phase 4D.
 *
 * Phase 4C gave the factory one good visual answer and made every part of it
 * compile. One answer is not a choice. This is the machinery that turns one
 * frozen product truth into several genuinely different presentations of it.
 *
 * The word doing the work is *structural*. Four dimensions here change what a
 * page is made of and what order it is in:
 *
 *   heroStrategy      -> a different opening, in the DOM, not a different size
 *   gridFamily        -> a different way a set of items is laid out
 *   sectionOrder      -> a different sequence of the same sections
 *   ctaPlacement      -> whether the page ends on an ask or on contact
 *
 * plus a `ResponsiveCompositionPlan`, which is deliberately subordinate to the
 * ArtDirectionPlan rather than a second visual authority: mobile is a place
 * where a direction makes its own decisions about order, navigation, density
 * and motion, not desktop with fewer columns.
 *
 * What is NOT here is as important. A direction cannot change a fact, a route,
 * a capability, a binding or an asset's rights. `applyVisualDirection` is a
 * permutation of a composed page and a re-choice of presentations the template
 * already renders — `assertPresentationOnly` proves that, and the tests hold it.
 *
 * Token differences — accent, radius, measure — travel with a direction because
 * a coherent direction needs them, but they can never be the *reason* two
 * candidates are different. `structuralSignature` deliberately excludes them,
 * so a candidate that changed only colours signs identically to its sibling and
 * `assessDiversity` refuses it before it costs an evidence capture.
 */

import fs from 'node:fs';
import path from 'node:path';
import { rehashComposition } from '../../packages/composition/src/index.js';
import { DEFAULT_ART_DIRECTION, LAYOUT_VARIANCE_ORDER, RESTRAINT_LEVELS, VISUAL_DISTINCTIVENESS_ORDER, compileArtDirectionPlan } from './art-direction.mjs';
import { MOTION_INTENSITY_ORDER } from './motion-contract.mjs';

export const HERO_STRATEGIES = Object.freeze(['split', 'editorial', 'immersive', 'utility']);
export const GRID_FAMILIES = Object.freeze(['symmetric', 'asymmetric', 'editorial-rows']);
export const HEADING_TREATMENTS = Object.freeze(['plain', 'ruled']);
export const CTA_PLACEMENTS = Object.freeze(['closing', 'mid-page']);
export const DISTINCTIVE_MOMENTS = Object.freeze(['lead-statement', 'full-bleed-lead', 'figure-index', 'none']);
export const ASSET_APPETITES = Object.freeze(['imagery-required', 'imagery-optional', 'typographic']);

export const MOBILE_HERO = Object.freeze(['copy-first', 'image-first', 'copy-only']);
export const MOBILE_NAVIGATION = Object.freeze(['disclosure', 'inline-scroll']);
export const MOBILE_SECTION_ORDER = Object.freeze(['as-desktop', 'conversion-first']);
export const MOBILE_DENSITY = Object.freeze(['as-desktop', 'tighter']);
export const MOBILE_MOTION = Object.freeze(['as-desktop', 'reduced']);

/**
 * Public-facing project types must carry a distinctive moment.
 *
 * A restrained professional site is allowed to be quiet; it is not allowed to
 * be anonymous. Making this a refusal rather than an aspiration is the only way
 * "each candidate should contain one memorable idea" survives contact with a
 * generator, and it is scoped to the project types where it is true: an
 * internal tool that is worked in has nothing to gain from a memorable opening.
 */
export const PUBLIC_PROJECT_TYPES = Object.freeze(['marketing-site', 'content-site']);

/**
 * Which section types the ctaPlacement rule may move, and where mobile
 * conversion-first pulls a section forward.
 *
 * Both lists are section *types*, which are the composer's vocabulary. Naming
 * ids would tie a direction to one project's composition.
 */
const CONVERSION_TYPES = Object.freeze(['contact-panel', 'enquiry-form', 'cta']);

const ORDER = Object.freeze({
  heroStrategy: HERO_STRATEGIES,
  gridFamily: GRID_FAMILIES,
  headingTreatment: HEADING_TREATMENTS,
  ctaPlacement: CTA_PLACEMENTS,
  distinctiveMoment: DISTINCTIVE_MOMENTS,
});

const RESPONSIVE_ORDER = Object.freeze({
  mobileHero: MOBILE_HERO,
  navigation: MOBILE_NAVIGATION,
  mobileSectionOrder: MOBILE_SECTION_ORDER,
  mobileDensity: MOBILE_DENSITY,
  mobileMotion: MOBILE_MOTION,
});

export const DEFAULT_COMPOSITION_DIMENSIONS = Object.freeze({
  heroStrategy: 'split',
  gridFamily: 'symmetric',
  headingTreatment: 'plain',
  ctaPlacement: 'closing',
  distinctiveMoment: 'none',
});

export const DEFAULT_RESPONSIVE_PLAN = Object.freeze({
  mobileHero: 'copy-first',
  navigation: 'disclosure',
  mobileSectionOrder: 'as-desktop',
  mobileDensity: 'as-desktop',
  mobileMotion: 'as-desktop',
});

export const VISUAL_DIRECTIONS_PATH = 'config/visual-directions.json';

/**
 * How an approved design reference reaches this authority.
 *
 * There is exactly one ArtDirectionPlan and this is still its compiler. A
 * reference does not get a plan of its own; it gets two bounded verbs against
 * the one that exists, and the axes it may name are split by what kind of
 * decision they are.
 *
 *   TUNABLE   — a value on a scale the plan already clamps. A preference
 *               overrides the registry's declared intent before the plan is
 *               compiled, so `restraintLevel` still cuts it back and still
 *               records the cut. A refusal moves the value to the nearest
 *               allowed point on the scale rather than throwing the direction
 *               away, because "less motion than that" is a request to turn a
 *               dial, not to delete an option.
 *
 *   STRUCTURAL — what a direction is made of. There is no nearest value: an
 *               immersive opening is not a quieter split opening. A refusal
 *               therefore removes the direction from the candidate set with a
 *               recorded reason, and a preference only ranks.
 *
 * Nothing here can reach a fact, a route, a binding, an asset's rights or a
 * capability. `assertPresentationOnly` still runs over the result, and the
 * refusals in `refusalReason` — asset readiness, the distinctive-moment rule —
 * are evaluated after reference influence, so a reference can never argue a
 * build into an imagery-led direction it has no photographs for.
 */
export const REFERENCE_TUNABLE_AXES = Object.freeze({
  layoutVariance: LAYOUT_VARIANCE_ORDER,
  motionIntensity: MOTION_INTENSITY_ORDER,
  visualDistinctiveness: VISUAL_DISTINCTIVENESS_ORDER,
  restraintLevel: RESTRAINT_LEVELS,
  density: Object.freeze(['relaxed', 'comfortable', 'compact', 'dense']),
  maxWidth: Object.freeze(['64rem', '68rem', '72rem', '90rem', '96rem']),
});

export const REFERENCE_STRUCTURAL_AXES = Object.freeze([
  'heroStrategy',
  'gridFamily',
  'headingTreatment',
  'ctaPlacement',
  'distinctiveMoment',
  'mobileHero',
  'navigation',
  'mobileSectionOrder',
  'mobileDensity',
  'mobileMotion',
]);

const DESIGN_AXES = Object.freeze(['density', 'maxWidth']);
const PLAN_AXES = Object.freeze(['layoutVariance', 'motionIntensity', 'visualDistinctiveness', 'restraintLevel']);

/** The nearest value on a scale that no reference refuses. */
function nearestAllowed(scale, declared, refused) {
  const forbidden = new Set(list(refused));
  if (!forbidden.has(declared)) return declared;
  const from = scale.indexOf(declared);
  const allowed = scale.map((value, index) => ({ value, index })).filter((entry) => !forbidden.has(entry.value));
  if (!allowed.length) return declared;
  return allowed.sort((a, b) => Math.abs(a.index - from) - Math.abs(b.index - from) || a.index - b.index)[0].value;
}

/**
 * Apply one influence to one axis and say what happened.
 *
 * A preference is applied only when the direction does not already carry it,
 * so an unchanged axis never appears as an adjustment a reviewer has to read.
 */
function tune(axis, declared, influence) {
  const scale = REFERENCE_TUNABLE_AXES[axis];
  const refused = influence?.refuse?.[axis];
  const preferred = influence?.prefer?.[axis];
  if (preferred !== undefined && scale.includes(preferred) && preferred !== declared) {
    return { value: preferred, adjustment: { axis, declared, applied: preferred, reason: 'reference-prefers' } };
  }
  const allowed = nearestAllowed(scale, declared, refused);
  if (allowed !== declared) return { value: allowed, adjustment: { axis, declared, applied: allowed, reason: 'reference-refuses' } };
  return { value: declared, adjustment: null };
}

/** Which structural values of a direction a reference forbids outright. */
export function structuralRefusals(entry, influence) {
  const refuse = influence?.refuse ?? {};
  const declared = {
    ...DEFAULT_COMPOSITION_DIMENSIONS,
    ...entry?.composition,
    ...DEFAULT_RESPONSIVE_PLAN,
    ...entry?.responsive,
  };
  return REFERENCE_STRUCTURAL_AXES
    .filter((axis) => list(refuse[axis]).includes(declared[axis]))
    .map((axis) => ({ axis, value: declared[axis] }));
}

export function loadVisualDirections(factoryRoot = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(factoryRoot, VISUAL_DIRECTIONS_PATH), 'utf8'));
}

function assertOneOf(scale, value, field, directionId) {
  if (!scale.includes(value)) throw new Error(`Visual direction ${directionId} declares an unsupported ${field}: ${String(value)}. It offers: ${scale.join(', ')}.`);
  return value;
}

/**
 * Compile a registry entry into the direction a build presents by.
 *
 * The ArtDirectionPlan is compiled by 4C's compiler rather than restated, so
 * `restraintLevel` still clamps and still records what it cut. The structural
 * dimensions ride alongside it in the same plan: a second plan would be a
 * second place a build's presentation could be decided.
 */
export function compileVisualDirection(directionId, registry, { referenceInfluence = null, overrides = null } = {}) {
  const entry = registry?.directions?.[directionId];
  if (!entry) throw new Error(`Unknown visual direction: ${String(directionId)}.`);

  // A rework's overrides land with the registry's own values and are validated
  // against exactly the same scales. A revision that could name a value the
  // registry cannot express would be a second direction registry written by
  // whoever wrote the verdict.
  const composition = { ...DEFAULT_COMPOSITION_DIMENSIONS, ...entry.composition, ...overrides?.composition };
  for (const [field, scale] of Object.entries(ORDER)) assertOneOf(scale, composition[field], field, directionId);
  const responsive = { ...DEFAULT_RESPONSIVE_PLAN, ...entry.responsive, ...overrides?.responsive };
  for (const [field, scale] of Object.entries(RESPONSIVE_ORDER)) assertOneOf(scale, responsive[field], field, directionId);
  assertOneOf(ASSET_APPETITES, entry.assetAppetite ?? 'imagery-optional', 'assetAppetite', directionId);

  const sectionOrder = Array.isArray(entry.composition?.sectionOrder) ? [...entry.composition.sectionOrder] : [];
  if (sectionOrder.includes('hero')) throw new Error(`Visual direction ${directionId} orders the hero. A page opens with its hero in every direction.`);

  // Reference influence lands here — on the intent, before the plan compiles —
  // rather than on the compiled plan. That is the difference between steering
  // the one authority and overwriting what it decided: `restraintLevel` still
  // clamps a reference's ambition and still records the clamp.
  const declaredIntent = { ...DEFAULT_ART_DIRECTION, ...entry.artDirection, ...overrides?.artDirection };
  const declaredDesign = { ...entry.design, ...overrides?.design };
  const adjustments = [];
  if (referenceInfluence) {
    for (const axis of PLAN_AXES) {
      const { value, adjustment } = tune(axis, declaredIntent[axis], referenceInfluence);
      declaredIntent[axis] = value;
      if (adjustment) adjustments.push(adjustment);
    }
    for (const axis of DESIGN_AXES) {
      if (declaredDesign[axis] === undefined) continue;
      const { value, adjustment } = tune(axis, declaredDesign[axis], referenceInfluence);
      declaredDesign[axis] = value;
      if (adjustment) adjustments.push(adjustment);
    }
  }

  const plan = compileArtDirectionPlan(declaredIntent);
  return {
    schemaVersion: 1,
    id: directionId,
    label: entry.label ?? directionId,
    purpose: entry.purpose ?? '',
    assetAppetite: entry.assetAppetite ?? 'imagery-optional',
    design: declaredDesign,
    artDirection: {
      ...plan,
      dimensions: { ...plan.dimensions, ...composition },
      // Responsive behaviour is part of visual direction, and it is derived
      // from the direction rather than authored beside it.
      responsive: { schemaVersion: 1, authority: 'art-direction-plan', ...responsive },
      // What an approved reference changed, beside what restraint cut. A
      // reviewer looking at an unusual plan has to be able to tell "the project
      // asked for this" from "a site somebody liked asked for this".
      //
      // Absent entirely when no reference informed the build, so a project that
      // never supplied one compiles exactly the plan it compiled before design
      // references existed rather than two empty arrays saying so.
      ...(referenceInfluence
        ? { referenceAdjustments: adjustments, referenceIds: [...(referenceInfluence.referenceIds ?? [])] }
        : {}),
      ...(overrides ? { reworkOverrides: { ...overrides.artDirection, ...overrides.design, ...overrides.composition, ...overrides.responsive } } : {}),
    },
    sectionOrder,
  };
}

/**
 * The custom property a responsive plan compiles to.
 *
 * Exactly one, because exactly one of the plan's decisions is a value. Order,
 * navigation shape and which way the hero stacks are structural changes only a
 * class can make, and mobile motion is a redeclaration of two existing motion
 * properties rather than a third — compiling a `--mobile-motion-scale` that
 * nothing could read would be a token invented to make the list look fuller.
 */
export function responsiveCompositionTokens(responsive = DEFAULT_RESPONSIVE_PLAN) {
  return {
    '--mobile-section-space-scale': responsive.mobileDensity === 'tighter' ? '0.7' : '1',
  };
}

/**
 * The class list the generated shell carries.
 *
 * Compiled here and written into the design module rather than reassembled in
 * the template, so the direction and the thing that renders it cannot disagree
 * about what a build was asked to look like.
 */
export function visualDirectionClasses({ id = null, artDirection = null, shellClass = null } = {}) {
  // No promoted direction, no direction classes. A build that never chose one
  // must carry exactly the shell it carried before Phase 4D rather than a row
  // of classes that all happen to be inert.
  if (!id) return shellClass ?? '';
  const dimensions = artDirection?.dimensions ?? DEFAULT_COMPOSITION_DIMENSIONS;
  const responsive = artDirection?.responsive ?? DEFAULT_RESPONSIVE_PLAN;
  return [
    shellClass,
    `direction-${id ?? 'default'}`,
    `grid-${dimensions.gridFamily}`,
    `headings-${dimensions.headingTreatment}`,
    `moment-${dimensions.distinctiveMoment}`,
    `mobile-hero-${responsive.mobileHero}`,
    `mobile-order-${responsive.mobileSectionOrder}`,
    // No `mobile-density-*` class: that decision compiles to
    // `--mobile-section-space-scale`, and a class beside the token would be a
    // second place the same decision could be made.
    `mobile-motion-${responsive.mobileMotion}`,
  ].filter(Boolean).join(' ');
}

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Re-present a composed page without changing what it says.
 *
 * Two operations, both permutations:
 *
 *   sectionOrder  — a stable sort of a page's non-hero sections by the priority
 *                   the direction declares, falling back to composed order for
 *                   anything it does not name;
 *   ctaPlacement  — `mid-page` lifts the closing call to action above the
 *                   conversion sections, so the page ends on contact detail
 *                   rather than on an ask.
 *
 * Nothing is added and nothing is dropped. A direction that could delete a
 * section would be editing the product, and the deterministic check below
 * refuses that regardless of what a direction declares.
 */
export function applyVisualDirection(composition, direction) {
  if (!composition?.pages) throw new Error('A composition with pages is required to apply a visual direction.');
  // A project type the registry offers no direction for keeps exactly what the
  // composer produced. Phase 4D must not change how a build with no direction
  // looks; it must give a build the option of looking different.
  if (!direction) return composition;
  const dimensions = direction?.artDirection?.dimensions ?? DEFAULT_COMPOSITION_DIMENSIONS;
  const order = list(direction?.sectionOrder);
  const byId = new Map(list(composition.sections).map((section) => [section.id, section]));

  const pages = composition.pages.map((page) => {
    const sections = list(page.sectionIds).map((id) => byId.get(id)).filter(Boolean);
    const hero = sections.filter((section) => section.type === 'hero');
    const rest = sections.filter((section) => section.type !== 'hero');

    const priority = (section) => {
      const index = order.indexOf(section.type);
      return index === -1 ? order.length : index;
    };
    const ordered = rest
      .map((section, index) => ({ section, index }))
      .sort((a, b) => priority(a.section) - priority(b.section) || a.index - b.index)
      .map((entry) => entry.section);

    const placed = dimensions.ctaPlacement === 'mid-page' ? liftCallToAction(ordered) : ordered;
    return { ...page, sectionIds: [...hero, ...placed].map((section) => section.id) };
  });

  const sections = list(composition.sections).map((section) => applyPresentation(section, dimensions));
  const next = rehashComposition({ ...composition, pages, sections });
  assertPresentationOnly(composition, next);
  return next;
}

/**
 * `mid-page`: the ask stops being the last thing on the page.
 *
 * The call to action moves above the first conversion section, so a visitor who
 * scrolls to the end lands on a phone number rather than on a button they have
 * already decided about. Where a page has no conversion section the order is
 * unchanged — moving a CTA to the end of a page it is already at the end of is
 * not a direction, it is a no-op pretending to be one.
 */
function liftCallToAction(sections) {
  const cta = sections.find((section) => section.type === 'cta');
  if (!cta) return sections;
  const rest = sections.filter((section) => section !== cta);
  const target = rest.findIndex((section) => CONVERSION_TYPES.includes(section.type));
  if (target === -1) return sections;
  return [...rest.slice(0, target), cta, ...rest.slice(target)];
}

/**
 * How a direction biases the presentation of a set of items.
 *
 * It is a bias rather than an override: `editorial-rows` wants indexed rows, so
 * a section the composer chose `cards` for becomes `features`, but a section
 * whose items are bare names stays a `list` because there is nothing to put in
 * the second column. Only variants the template implements are ever produced —
 * 4C.4 refuses a build naming one it does not, and this must not be the thing
 * that trips it.
 */
const GRID_VARIANTS = Object.freeze({
  // The regular grid is what the composer already chooses for, so it changes
  // nothing. A bias that restated the default would make every build look like
  // it had been through a direction it never chose.
  symmetric: {},
  asymmetric: { features: 'cards' },
  'editorial-rows': { cards: 'features' },
});

const PRESENTED_TYPES = new Set(['item-grid', 'proof-grid', 'people-grid', 'location-list', 'entity-list', 'content-list']);

function applyPresentation(section, dimensions) {
  if (section.type === 'hero') {
    // The hero's own variant stays the composer's: `primary` and `compact`
    // distinguish an entry page from a secondary one, which is a property of
    // the page rather than of the direction. The strategy is what the direction
    // decides, and the renderer reads it from the plan.
    return section;
  }
  if (!PRESENTED_TYPES.has(section.type)) return section;
  const mapping = GRID_VARIANTS[dimensions.gridFamily] ?? GRID_VARIANTS.symmetric;
  const variant = mapping[section.variant] ?? section.variant;
  return variant === section.variant ? section : { ...section, variant };
}

/**
 * Prove a direction re-presented the build rather than rewrote it.
 *
 * This is the guarantee the whole stage rests on: candidates are comparable
 * only because they say the same thing. It is enforced here rather than trusted
 * to the registry, so a badly written direction fails loudly instead of quietly
 * publishing a different site.
 */
export function assertPresentationOnly(before, after) {
  const pagesBefore = new Map(list(before.pages).map((page) => [page.id, page]));
  const pagesAfter = new Map(list(after.pages).map((page) => [page.id, page]));
  if (pagesBefore.size !== pagesAfter.size) throw new Error('A visual direction changed the set of pages.');
  for (const [id, page] of pagesBefore) {
    const next = pagesAfter.get(id);
    if (!next) throw new Error(`A visual direction removed page ${id}.`);
    if (next.path !== page.path) throw new Error(`A visual direction changed the route of page ${id}.`);
    const a = [...list(page.sectionIds)].sort();
    const b = [...list(next.sectionIds)].sort();
    if (a.length !== b.length || a.some((value, index) => value !== b[index])) {
      throw new Error(`A visual direction added or removed sections on page ${id}.`);
    }
  }
  const sectionsBefore = new Map(list(before.sections).map((section) => [section.id, section]));
  for (const section of list(after.sections)) {
    const original = sectionsBefore.get(section.id);
    if (!original) throw new Error(`A visual direction introduced section ${section.id}.`);
    for (const field of ['type', 'purpose']) {
      if (JSON.stringify(section[field]) !== JSON.stringify(original[field])) throw new Error(`A visual direction changed ${field} on section ${section.id}.`);
    }
    for (const field of ['bindings', 'actions', 'assetIds']) {
      if (JSON.stringify(section[field]) !== JSON.stringify(original[field])) throw new Error(`A visual direction changed ${field} on section ${section.id}. A direction presents the product; it does not edit it.`);
    }
  }
  if (JSON.stringify(list(before.warnings)) !== JSON.stringify(list(after.warnings))) throw new Error('A visual direction changed the composition warnings.');
  return true;
}

/**
 * What makes one candidate structurally different from another.
 *
 * Deliberately excludes every token: accent, radius, measure and the type scale
 * are all absent. Two candidates that differ only in colour therefore produce
 * the same signature, which is exactly what `assessDiversity` needs in order to
 * refuse a theme swap before it costs a browser run.
 *
 * `sequence` is the strongest signal in here and the cheapest to read: the
 * ordered list of what each page presents, as type and variant.
 */
export function structuralSignature({ direction, composition, design = null }) {
  const dimensions = direction?.artDirection?.dimensions ?? DEFAULT_COMPOSITION_DIMENSIONS;
  const responsive = direction?.artDirection?.responsive ?? DEFAULT_RESPONSIVE_PLAN;
  const byId = new Map(list(composition?.sections).map((section) => [section.id, section]));
  return {
    schemaVersion: 1,
    directionId: direction?.id ?? null,
    axes: {
      heroStrategy: dimensions.heroStrategy,
      gridFamily: dimensions.gridFamily,
      headingTreatment: dimensions.headingTreatment,
      ctaPlacement: dimensions.ctaPlacement,
      distinctiveMoment: dimensions.distinctiveMoment,
      layoutVariance: dimensions.layoutVariance,
      visualDistinctiveness: dimensions.visualDistinctiveness,
      motionIntensity: dimensions.motionIntensity,
      informationDensity: design?.density ?? dimensions.informationDensity ?? null,
      layoutFamily: design?.patternId ?? null,
      responsiveStrategy: `${responsive.mobileHero}/${responsive.navigation}/${responsive.mobileSectionOrder}/${responsive.mobileDensity}/${responsive.mobileMotion}`,
    },
    sequence: list(composition?.pages).map((page) => ({
      pageId: page.id,
      presentation: list(page.sectionIds).map((id) => {
        const section = byId.get(id);
        return section ? `${section.type}:${section.variant}` : id;
      }),
    })),
  };
}

/**
 * The three independent places a visitor can see a structural difference.
 *
 * Separating them is what makes the diversity rule explicable. "63% different"
 * over a bag of incommensurable fields is a number invented to look rigorous;
 * "these two differ in what the page is made of and in what it does on a
 * phone, but present it in the same order" is something a reviewer can act on.
 */
const COMPOSITION_AXES = Object.freeze([
  'heroStrategy',
  'gridFamily',
  'headingTreatment',
  'ctaPlacement',
  'distinctiveMoment',
  'layoutVariance',
  'visualDistinctiveness',
  'motionIntensity',
  'informationDensity',
  'layoutFamily',
]);

/**
 * How many of the three planes must differ.
 *
 * Two, and deliberately not three: an application surface is a case where the
 * section order genuinely is not where the difference lives — a dense utility
 * opening and a structured practice opening present the same sequence and are
 * plainly not the same build. Requiring all three would refuse a real choice;
 * requiring one would accept a shuffle.
 */
export const MINIMUM_DIFFERING_PLANES = 2;

/**
 * A single incidental change is not a plane.
 *
 * The composition plane counts as different only when at least two of its axes
 * differ, so a pair that shares an opening, a grid and a rhythm cannot claim to
 * be structurally different because one of them clamped its motion.
 */
const MINIMUM_COMPOSITION_AXES = 2;

function differingAxes(a, b) {
  return COMPOSITION_AXES.filter((axis) => a.axes[axis] !== b.axes[axis]);
}

function differingPlanes(a, b) {
  const axes = differingAxes(a, b);
  return {
    axes,
    planes: {
      sequence: JSON.stringify(a.sequence) !== JSON.stringify(b.sequence),
      composition: axes.length >= MINIMUM_COMPOSITION_AXES,
      responsive: a.axes.responsiveStrategy !== b.axes.responsiveStrategy,
    },
  };
}

/**
 * Refuse a candidate set whose members are the same build in other colours.
 *
 * Runs before evidence capture, because the cheapest place to find out that two
 * candidates are the same is before a browser has photographed both of them.
 */
export function assessDiversity(signatures) {
  const duplicates = [];
  for (let i = 0; i < signatures.length; i += 1) {
    for (let j = i + 1; j < signatures.length; j += 1) {
      const [a, b] = [signatures[i], signatures[j]];
      const { axes, planes } = differingPlanes(a, b);
      const differing = Object.entries(planes).filter(([, changed]) => changed).map(([name]) => name);
      if (differing.length >= MINIMUM_DIFFERING_PLANES) continue;
      duplicates.push({
        a: a.directionId,
        b: b.directionId,
        differingAxes: axes,
        differingPlanes: differing,
        reason: differing.length === 0 ? 'theme-swap' : 'insufficient-structural-difference',
        detail: differing.length === 0
          ? `${a.directionId} and ${b.directionId} present every page in the same order, are made of the same things and behave the same way on a phone. The only difference a visitor could see is token-level.`
          : `${a.directionId} and ${b.directionId} differ only in ${differing.join(' and ')} (${axes.length} composition ${axes.length === 1 ? 'axis' : 'axes'}: ${axes.join(', ') || 'none'}), below the ${MINIMUM_DIFFERING_PLANES} of sequence, composition and responsive behaviour a candidate set needs.`,
      });
    }
  }
  return { distinct: duplicates.length === 0, duplicates, count: signatures.length };
}

/**
 * What each distinctive moment needs in order to be visible.
 *
 * A declared moment that renders nothing is the same failure as a registry
 * entry for a component the template does not have: it reads as a considered
 * decision and is an empty one. The nbm acceptance found exactly that — a
 * practice with no photography was offered a direction whose memorable idea was
 * a numbered index of its work, and there was no work to index.
 *
 * `none` requires nothing and is refused for public-facing types separately.
 */
const MOMENT_REQUIREMENTS = Object.freeze({
  'lead-statement': Object.freeze({
    describe: 'a page opening that carries a sentence, not only a name',
    // The lead statement sets the hero's own body copy apart. A hero with a
    // title and nothing else has nothing to set apart.
    satisfiedBy: (composition) => list(composition?.sections).some((section) => section.type === 'hero' && list(section.bindings).some((binding) => binding.key === 'body')),
  }),
  'full-bleed-lead': Object.freeze({
    describe: 'a gallery of published work to run edge to edge',
    satisfiedBy: (composition) => list(composition?.sections).some((section) => section.type === 'gallery' && list(section.assetIds).length > 0),
  }),
  'figure-index': Object.freeze({
    describe: 'a set of things worth numbering — published work, or the services the practice offers',
    satisfiedBy: (composition) => list(composition?.sections).some((section) => (section.type === 'gallery' && list(section.assetIds).length > 0) || section.type === 'item-grid'),
  }),
  none: Object.freeze({ describe: 'nothing', satisfiedBy: () => true }),
});

/**
 * Which directions a project may generate candidates from.
 *
 * Four inputs, and each one can refuse: the registry's own project-type list,
 * asset readiness (an imagery-led direction with no publishable photograph is
 * refused before it becomes a candidate that looks broken), the distinctive
 * moment rule for public-facing types, and — where a composition is supplied —
 * whether that moment has anything to render.
 */
export function selectVisualDirections({ projectType, registry, assetReadiness = null, composition = null, requested = null, referenceInfluence = null } = {}) {
  const offered = requested ?? registry?.projectTypeCandidates?.[projectType] ?? [];
  const eligible = [];
  const refused = [];
  for (const id of offered) {
    // The structural refusal is read from the registry entry rather than from
    // the compiled direction, because it is a statement about what the
    // direction *is*. Tuning cannot rescue it and must not disguise it.
    const structural = structuralRefusals(registry?.directions?.[id], referenceInfluence);
    if (structural.length) {
      refused.push({
        directionId: id,
        reason: 'reference-avoids-trait',
        detail: `${id} presents ${structural.map((entry) => `${entry.axis} ${entry.value}`).join(' and ')}, which an approved design reference asks this project to avoid.`,
      });
      continue;
    }
    const direction = compileVisualDirection(id, registry, { referenceInfluence });
    const reason = refusalReason(direction, { projectType, assetReadiness, composition });
    if (reason) refused.push({ directionId: id, ...reason });
    else eligible.push(direction);
  }
  return { eligible, refused };
}

function refusalReason(direction, { projectType, assetReadiness, composition }) {
  const moment = direction.artDirection.dimensions.distinctiveMoment;
  if (PUBLIC_PROJECT_TYPES.includes(projectType) && moment === 'none') {
    return { reason: 'no-distinctive-moment', detail: `${direction.id} declares no distinctive moment, which a ${projectType} candidate has to carry.` };
  }
  if (direction.assetAppetite === 'imagery-required' && assetReadiness && !assetReadiness.supportsImageryLed) {
    return { reason: 'imagery-not-available', detail: `${direction.id} leads with photography and the approved inventory cannot support it: ${assetReadiness.strategyReason}` };
  }
  const requirement = MOMENT_REQUIREMENTS[moment];
  if (composition && requirement && !requirement.satisfiedBy(composition)) {
    return { reason: 'distinctive-moment-not-renderable', detail: `${direction.id}'s distinctive moment is ${moment}, which needs ${requirement.describe}. This build has none, so the moment would be a decision that renders nothing.` };
  }
  return null;
}
