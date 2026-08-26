/**
 * The Presentation Registry.
 *
 * Kept deliberately separate from the capability registry. Recipes decide what
 * a generated app can *do*; this decides how its surfaces may be *shown*. They
 * meet in exactly one place — a section whose component is owned by a recipe —
 * and that meeting is what this makes checkable.
 *
 * It is compiled rather than authored. The template already declares each
 * component's id, version, binding roles and the variants it renders, and that
 * stays the single declaration of those. `config/presentation-manifest.json`
 * adds only what a template cannot express: what renders a component, what a
 * build must have wired for it to render correctly, and which design tokens its
 * own appearance depends on.
 *
 * Nothing fictional is admitted. Compilation fails closed when the manifest
 * names a component the template does not render, or when the template renders
 * one the manifest has never described, so the registry cannot drift into a
 * catalogue of components that do not exist.
 */

import fs from 'node:fs';
import path from 'node:path';

export const PRESENTATION_MANIFEST_PATH = 'config/presentation-manifest.json';
export const LIFECYCLES = Object.freeze(['ready', 'planned']);

/**
 * Requirements a build satisfies structurally rather than by installing
 * anything. Every component needs the template's renderer and the compiled
 * token set; naming them keeps the list honest about what "renders correctly"
 * actually depends on.
 */
const STRUCTURAL_REQUIREMENTS = Object.freeze(['template-renderer', 'compiled-design-tokens']);

export function loadPresentationManifest(factoryRoot = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(factoryRoot, PRESENTATION_MANIFEST_PATH), 'utf8'));
}

/**
 * Merge the template's declarations with the manifest's, or refuse.
 *
 * The failures here are the ones that matter: a registry describing a component
 * nobody renders is a catalogue, and a rendered component nobody described is a
 * component whose runtime requirements nothing can check.
 */
export function compilePresentationRegistry({ template, manifest }) {
  const declared = template?.presentation?.components ?? {};
  const described = manifest?.components ?? {};
  const byComponentId = new Map(Object.entries(declared).map(([sectionType, component]) => [component.id, { sectionType, component }]));

  const undescribed = [...byComponentId.keys()].filter((id) => !Object.hasOwn(described, id));
  if (undescribed.length) throw new Error(`Presentation registry incomplete: the template renders ${undescribed.join(', ')} but the manifest does not describe them.`);

  const entries = {};
  for (const [componentId, entry] of Object.entries(described)) {
    const match = byComponentId.get(componentId);
    if (!match) throw new Error(`Presentation registry describes ${componentId}, which this template does not render. Seed the registry from components that exist.`);
    if (!LIFECYCLES.includes(entry.lifecycle)) throw new Error(`Presentation entry ${componentId} declares lifecycle ${String(entry.lifecycle)}; it offers: ${LIFECYCLES.join(', ')}.`);
    if (entry.sectionType !== match.sectionType) throw new Error(`Presentation entry ${componentId} claims section type ${entry.sectionType}, but the template renders it for ${match.sectionType}.`);
    entries[match.sectionType] = {
      componentId,
      componentVersion: match.component.version,
      sectionType: match.sectionType,
      lifecycle: entry.lifecycle,
      purpose: entry.purpose,
      renderer: entry.renderer,
      runtimeRequirements: [...(entry.runtimeRequirements ?? [])],
      tokens: [...(entry.tokens ?? [])],
      // Variants stay the template's declaration rather than being restated.
      variants: (match.component.variants ?? []).map((variant) => ({ ...variant })),
    };
  }

  return {
    schemaVersion: 1,
    templateId: template.id,
    templateVersion: template.version,
    presentationVersion: template.presentation?.version ?? null,
    components: entries,
  };
}

/** What may be shown today, as opposed to what is described. */
export function readyPresentation(registry, sectionType) {
  const entry = registry?.components?.[sectionType];
  return entry && entry.lifecycle === 'ready' ? entry : null;
}

/**
 * Whether a build actually satisfies what a section's presentation needs.
 *
 * The failure this exists for is quiet rather than loud. An `enquiry-form`
 * section whose `lead-generation` recipe was not installed still renders — as a
 * heading with nothing under it. The composer and the renderer happen to agree
 * today because both key off the same module name in two separate places;
 * checking it here makes the agreement enforced rather than coincidental.
 */
export function unmetPresentationRequirements(entry, { recipeIds = [] } = {}) {
  const installed = new Set(recipeIds);
  const unmet = [];
  for (const requirement of entry.runtimeRequirements) {
    if (requirement.startsWith('recipe:')) {
      if (!installed.has(requirement.slice('recipe:'.length))) unmet.push(requirement);
      continue;
    }
    // An unrecognised requirement is reported rather than assumed met, so a
    // manifest cannot quietly declare a dependency nothing knows how to check.
    if (!STRUCTURAL_REQUIREMENTS.includes(requirement)) unmet.push(`unknown:${requirement}`);
  }
  return unmet;
}

/**
 * Check a composed build against the registry.
 *
 * Returns the problems rather than throwing, so a caller can decide whether an
 * unmet requirement stops a build or is recorded as a gap.
 */
export function auditComposedPresentation({ registry, composition, recipeIds = [] }) {
  const problems = [];
  for (const section of composition?.sections ?? []) {
    const entry = registry.components[section.type];
    if (!entry) {
      problems.push({ sectionId: section.id, sectionType: section.type, problem: 'unregistered', detail: `no presentation entry describes ${section.type}` });
      continue;
    }
    if (entry.lifecycle !== 'ready') {
      problems.push({ sectionId: section.id, sectionType: section.type, problem: 'not-ready', detail: `${entry.componentId} is ${entry.lifecycle}` });
      continue;
    }
    for (const requirement of unmetPresentationRequirements(entry, { recipeIds })) {
      problems.push({ sectionId: section.id, sectionType: section.type, problem: 'unmet-requirement', detail: requirement });
    }
    // A variant nothing renders is a class that styles nothing. `default` is
    // always allowed: it is not a missing value but the renderer's own
    // content-driven choice, which is the right answer where the composer has
    // no reason to prefer one presentation over another.
    const allowed = ['default', ...entry.variants.map((variant) => variant.id)];
    if (!allowed.includes(section.variant)) {
      problems.push({ sectionId: section.id, sectionType: section.type, problem: 'unrendered-variant', detail: `${entry.componentId} does not render ${section.variant}. It renders: ${allowed.join(', ')}.` });
    }
  }
  return problems;
}

/**
 * Tokens a ready component's appearance depends on that no build would resolve.
 *
 * A component declaring `--hero-scale` is stating a dependency on the design
 * system compiling it. If the compiler stops emitting it and the template stops
 * defaulting it, that component renders against an unresolvable custom property
 * and silently loses its own shape.
 */
export function unresolvableTokens(registry, { compiled = {}, defaults = new Set() } = {}) {
  const missing = [];
  for (const entry of Object.values(registry.components)) {
    if (entry.lifecycle !== 'ready') continue;
    for (const token of entry.tokens) {
      if (Object.hasOwn(compiled, token) || defaults.has(token)) continue;
      missing.push({ componentId: entry.componentId, token });
    }
  }
  return missing;
}
