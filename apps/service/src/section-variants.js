import { compilePresentationRegistry, loadPresentationManifest, readyPresentation } from '../../../tooling/lib/presentation-registry.mjs';

/**
 * Presentation choices.
 *
 * A section can be shown more than one way, but only in the ways its template
 * actually implements. The template declares those; anything else is refused
 * rather than written into the composition as a class that styles nothing.
 *
 * The choice goes through the Presentation Registry rather than straight to the
 * template, so a component that is described but not yet ready is offered to
 * nobody. A registry that could hand a person a presentation the build cannot
 * render would be worse than no registry.
 */
const registries = new WeakMap();

/**
 * The registry for a build's own template.
 *
 * Cached per template object: `sectionVariantOptions` asks once per section,
 * and re-reading and re-compiling the manifest each time would turn one file
 * read into one per section of the build.
 */
function presentationRegistry(template) {
  if (!template?.presentation) return null;
  if (registries.has(template)) return registries.get(template);
  let registry = null;
  try {
    registry = compilePresentationRegistry({ template, manifest: loadPresentationManifest() });
  } catch {
    // A registry that will not compile is a factory fault, not a reason to
    // offer presentations nothing has checked.
    registry = null;
  }
  registries.set(template, registry);
  return registry;
}

export function componentVariants(template, sectionType) {
  const component = template?.presentation?.components?.[sectionType];
  if (!component) return { component: null, variants: [] };
  const entry = readyPresentation(presentationRegistry(template), sectionType);
  return entry ? { component, variants: entry.variants } : { component: null, variants: [] };
}

/**
 * What a person may choose for each section of the live build.
 *
 * A section whose component declares one presentation offers no choice, and
 * says so by returning no options rather than by offering the one it already
 * has.
 */
export function sectionVariantOptions(service, projectId) {
  const composition = service.getComposition(projectId);
  if (!composition) return [];
  const template = service.workspaceTemplate(projectId);
  const chosen = new Map(service.readSectionVariants(projectId).choices.map((entry) => [entry.sectionId, entry]));
  const pageOfSection = new Map();
  for (const page of composition.pages) {
    for (const sectionId of page.sectionIds ?? []) pageOfSection.set(sectionId, page);
  }

  return composition.sections.flatMap((section) => {
    const { component, variants } = componentVariants(template, section.type);
    if (!component || variants.length < 2) return [];
    const page = pageOfSection.get(section.id) ?? null;
    return [{
      sectionId: section.id,
      sectionType: section.type,
      pageId: page?.id ?? null,
      pagePath: page?.path ?? null,
      componentId: component.id,
      componentVersion: component.version,
      variant: section.variant,
      composedVariant: section.variantOverriddenFrom ?? section.variant,
      chosen: chosen.has(section.id),
      chosenAt: chosen.get(section.id)?.chosenAt ?? null,
      variants,
    }];
  });
}

export async function chooseSectionVariant(service, projectId, sectionId, variant) {
  const composition = service.getComposition(projectId);
  if (!composition) throw new Error('Presentation choices need a generated build; there are no sections to choose for yet.');
  const section = composition.sections.find((entry) => entry.id === sectionId);
  if (!section) throw new Error(`Unknown project section: ${sectionId}`);

  const existing = service.readSectionVariants(projectId).choices.filter((entry) => entry.sectionId !== sectionId);

  // Clearing returns the section to what the factory composed rather than
  // recording a choice that happens to match it.
  if (variant === null || variant === undefined || variant === 'clear') {
    return { choices: await service.writeSectionVariants(projectId, existing, { sectionId, variant: null }) };
  }

  const { component, variants } = componentVariants(service.workspaceTemplate(projectId), section.type);
  if (!component) throw new Error(`Unknown project section: ${sectionId} renders through a component this template does not declare.`);
  if (!variants.some((entry) => entry.id === variant)) {
    const offered = variants.map((entry) => entry.id).join(', ') || 'none';
    throw new Error(`Unsupported section variant: ${component.id} does not render ${variant}. It offers: ${offered}.`);
  }

  const choice = { sectionId, variant, chosenAt: new Date().toISOString(), chosenBy: 'console' };
  return { choices: await service.writeSectionVariants(projectId, [...existing, choice], choice) };
}
