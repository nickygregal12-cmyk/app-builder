/**
 * Renderer selection.
 *
 * Until Phase 4.2 the factory had one architectural output. Every project type
 * — a five-page cost consultancy and a multi-tenant SaaS console alike —
 * resolved through `templates.projectTypeDefaults` to the same React/Vite
 * template, which meant a marketing site shipped 212kB of JavaScript to render
 * one contentless `<div id="root">` and wrote its own `<title>` after boot.
 *
 * This is the seam that stops that. It is deliberately small and deliberately
 * boring: a renderer is chosen from the project type and the capabilities the
 * manifest enables, and from nothing else. No prompt, no model, no free text.
 * The same approved truth always reaches the same renderer, which is what makes
 * a rebuild a rebuild rather than a re-roll.
 *
 * What a renderer is NOT is the important half. It is not a second composer, a
 * second product schema, a second content model, a second Design Contract, a
 * second brand or art-direction authority and not a second presentation
 * registry. Both renderers consume the composition, the DesignSystemSpec and
 * the Presentation Registry the factory already compiles. A renderer renders
 * decisions; it does not make new ones.
 *
 * Deployment is not here either. Where a build is hosted is the deployment
 * adapter's decision, and a renderer that knew about Netlify would be the
 * beginning of a static template that only deploys one way.
 */

import fs from 'node:fs';
import path from 'node:path';

export const RENDERERS_PATH = 'config/renderers.json';
export const OUTPUT_MODES = Object.freeze(['prerendered', 'client-application']);

export function loadRenderers(factoryRoot = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(factoryRoot, RENDERERS_PATH), 'utf8'));
}

function entryFor(registry, rendererId) {
  const entry = registry?.renderers?.[rendererId];
  if (!entry) throw new Error(`Unknown renderer: ${String(rendererId)}. The registry offers: ${Object.keys(registry?.renderers ?? {}).join(', ')}.`);
  if (!OUTPUT_MODES.includes(entry.outputMode)) throw new Error(`Renderer ${rendererId} declares an unsupported output mode: ${String(entry.outputMode)}. It offers: ${OUTPUT_MODES.join(', ')}.`);
  if (!entry.template) throw new Error(`Renderer ${rendererId} names no template, so nothing could be generated from it.`);
  return entry;
}

const enabledModules = (manifest) => new Set(Object.entries(manifest?.modules ?? {}).filter(([, on]) => on).map(([name]) => name));

/**
 * Which renderer this project is built by, and why.
 *
 * The project type decides first, because it is the honest statement of what
 * kind of product this is. A capability override may then move the project,
 * and only ever *towards* a renderer that can carry the capability the manifest
 * enabled: a marketing site with a real authenticated area is an application
 * that has marketing pages, and rendering its sign-in as a static document
 * would be a worse product, not a leaner one.
 *
 * The reverse is refused. Nothing here may move a SaaS console onto the static
 * renderer because someone enabled `seo`, so an override that does not widen
 * what the project can do is ignored rather than obeyed.
 */
export function selectRenderer(manifest, { renderers = null, factoryRoot = process.cwd() } = {}) {
  const registry = renderers ?? loadRenderers(factoryRoot);
  const projectType = manifest?.project?.type;
  const defaultId = registry?.projectTypeDefaults?.[projectType];
  if (!defaultId) throw new Error(`No renderer is declared for project type ${String(projectType)}. Declare one in ${RENDERERS_PATH} rather than falling back to whichever renderer happens to exist.`);
  entryFor(registry, defaultId);

  const modules = enabledModules(manifest);
  for (const override of registry.capabilityOverrides ?? []) {
    const matched = (override.modules ?? []).filter((name) => modules.has(name));
    if (!matched.length) continue;
    const rendererId = override.renderer;
    if (rendererId === defaultId) continue;
    const target = entryFor(registry, rendererId);
    // An override only ever moves a project to a fuller client runtime. This is
    // the guard that keeps the rule from becoming "whichever override matched
    // last wins", which is how a deterministic selection quietly stops being one.
    if (target.clientRuntime !== 'full') continue;
    return {
      rendererId,
      renderer: target,
      templateId: target.template,
      projectType,
      defaultRendererId: defaultId,
      overridden: true,
      reason: `${override.reason} Modules that required it: ${matched.sort().join(', ')}.`,
    };
  }

  const renderer = entryFor(registry, defaultId);
  return {
    rendererId: defaultId,
    renderer,
    templateId: renderer.template,
    projectType,
    defaultRendererId: defaultId,
    overridden: false,
    reason: `Project type ${projectType} is rendered by ${defaultId} (${renderer.label}).`,
  };
}

/**
 * Resolve the renderer-specific half of a contributor.
 *
 * A recipe or adapter declares one implementation at the top level — the one
 * the application renderer has always used — and may declare a variant per
 * renderer. Merging here rather than at every call site is what keeps
 * `copyManagedFiles`, `mergePackage` and the recipe registry renderer-blind:
 * they receive one normalised contributor and never learn there are two.
 *
 * A contributor with no variant for the selected renderer keeps its base
 * implementation. That is correct for anything genuinely renderer-neutral, and
 * a contributor that is *not* neutral says so by leaving the renderer out of
 * `compatibleTemplates`, which fails closed before this is ever reached.
 */
export function resolveRendererVariant(contributor, rendererId) {
  const variant = contributor?.renderers?.[rendererId];
  const { renderers: _declared, ...base } = contributor ?? {};
  const resolved = {
    ...base,
    filesRoot: base.filesRoot ?? 'files',
    rendererVariant: null,
  };
  if (!variant) return resolved;
  return {
    ...resolved,
    ...variant,
    filesRoot: variant.filesRoot ?? resolved.filesRoot,
    package: variant.package ?? base.package,
    rendererVariant: rendererId,
  };
}
