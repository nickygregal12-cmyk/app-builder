import { createHash } from 'node:crypto';

/**
 * Builder Element Identity.
 *
 * A rendered element resolves to an entry here or it is not editable. The chain
 * is DOM -> ElementIdentity -> PageSpec -> SectionSpec -> component instance ->
 * exact binding/property/token -> durable edit. Nothing in it asks a model to
 * guess which file a pixel came from.
 *
 * Derivation is a pure function of the composition and the template's own
 * presentation declaration, so the same build always produces the same index
 * and an identity can be recomputed rather than remembered.
 */

const ELEMENT_KEY_PATTERN = /^(?:section|binding:[A-Za-z0-9_-]+|action:[0-9]+|asset:[A-Za-z0-9_-]+)$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function elementRef(pageId, sectionId, elementKey) {
  return `${pageId}/${sectionId}/${elementKey}`;
}

/**
 * Split a ref back into its coordinates.
 *
 * A ref that does not match the shape is `malformed` rather than "not found":
 * the difference matters, because a malformed ref means the caller invented an
 * address and a missing one means the build moved on.
 */
export function parseElementRef(ref) {
  if (typeof ref !== 'string') return null;
  const parts = ref.split('/');
  if (parts.length !== 3) return null;
  const [pageId, sectionId, elementKey] = parts;
  if (!ID_PATTERN.test(pageId) || !ID_PATTERN.test(sectionId) || !ELEMENT_KEY_PATTERN.test(elementKey)) return null;
  return { pageId, sectionId, elementKey };
}

export function bindingElementKey(bindingKey) {
  return `binding:${bindingKey}`;
}

function role(presentation, name) {
  return presentation.elementRoles?.[name] ?? null;
}

function provenanceOf(entry) {
  return {
    origin: entry?.origin ?? 'deterministic-default',
    generated: Boolean(entry?.generated),
    overridden: Boolean(entry?.overriddenFrom),
    overriddenFromOrigin: entry?.overriddenFrom?.origin ?? null,
    sourceIds: [...new Set(list(entry?.sourceIds))],
    factIds: [...new Set(list(entry?.factIds))],
    entityIds: [...new Set(list(entry?.entityIds))],
  };
}

function structuralProvenance(origin) {
  return { origin, generated: false, overridden: false, overriddenFromOrigin: null, sourceIds: [], factIds: [], entityIds: [] };
}

function location(presentation, pointer) {
  return {
    artifact: '.app-builder/composition.json',
    pointer,
    generatedModule: 'src/generated/composition.ts',
    renderer: presentation.renderer,
  };
}

/**
 * Derive every editable element of a composed build.
 *
 * A section type the template has not declared produces no identities at all.
 * That is deliberate: an undeclared section still renders, but the Builder
 * refuses to act on it rather than assuming the generic component's rules.
 */
export function deriveElementIdentities({
  composition,
  presentation,
  projectId,
  templateId,
  templateVersion,
  assets = {},
} = {}) {
  if (!composition?.sections || !composition?.pages) throw new Error('A composition with pages and sections is required to derive element identity.');
  if (!presentation?.components || !presentation?.elementRoles) throw new Error(`Template ${templateId ?? 'unknown'} declares no presentation contract, so its rendered elements cannot be identified.`);
  if (!projectId) throw new Error('Element identity is always resolved inside a project; projectId is required.');

  const pageOfSection = new Map();
  for (const page of composition.pages) {
    for (const sectionId of list(page.sectionIds)) pageOfSection.set(sectionId, page);
  }

  const elements = [];
  composition.sections.forEach((section, sectionIndex) => {
    const page = pageOfSection.get(section.id);
    const component = presentation.components[section.type];
    if (!page || !component) return;

    const base = {
      pageId: page.id,
      pagePath: page.path,
      sectionId: section.id,
      sectionType: section.type,
      sectionVariant: section.variant,
      componentId: component.id,
      componentVersion: component.version,
      componentInstanceId: section.id,
    };

    const push = (elementKey, roleName, extra) => {
      const declared = role(presentation, roleName);
      if (!declared) throw new Error(`Template ${templateId} maps ${section.type} to element role ${roleName}, which it does not declare.`);
      elements.push({
        ref: elementRef(page.id, section.id, elementKey),
        ...base,
        elementKey,
        elementRole: roleName,
        bindingKey: null,
        editableProperties: [...declared.editableProperties],
        designTokens: [...declared.designTokens],
        assetBinding: null,
        ...extra,
      });
    };

    push('section', 'section', {
      provenance: structuralProvenance('composition'),
      sourceLocation: location(presentation, `/sections/${sectionIndex}`),
    });

    list(section.bindings).forEach((entry, bindingIndex) => {
      const roleName = component.bindingRoles?.[entry.key] ?? component.defaultBindingRole;
      push(bindingElementKey(entry.key), roleName, {
        bindingKey: entry.key,
        provenance: provenanceOf(entry),
        sourceLocation: location(presentation, `/sections/${sectionIndex}/bindings/${bindingIndex}`),
      });
    });

    if (component.actions) {
      list(section.actions).forEach((_, actionIndex) => {
        push(`action:${actionIndex}`, 'action', {
          provenance: structuralProvenance('composition'),
          sourceLocation: location(presentation, `/sections/${sectionIndex}/actions/${actionIndex}`),
        });
      });
    }

    if (component.assets) {
      list(section.assetIds).forEach((assetId, assetIndex) => {
        const asset = assets[assetId] ?? null;
        push(`asset:${assetId}`, 'asset', {
          provenance: structuralProvenance(asset?.provenance ?? 'knowledge-asset'),
          sourceLocation: location(presentation, `/sections/${sectionIndex}/assetIds/${assetIndex}`),
          assetBinding: {
            assetId,
            kind: asset?.kind ?? null,
            provenance: asset?.provenance ?? null,
            assetStatus: asset?.assetStatus ?? null,
            rightsStatus: asset?.rightsStatus ?? null,
          },
        });
      });
    }
  });

  const base = {
    schemaVersion: 1,
    projectId,
    templateId,
    templateVersion,
    presentationVersion: presentation.version,
    compositionHash: composition.compositionHash,
    elements,
  };
  return { ...base, indexHash: hash(base) };
}

/**
 * Resolve one ref against an index.
 *
 * Four outcomes, never a guess: `malformed` for an address that is not an
 * address, `stale` when the build has moved past the index the caller read,
 * `unknown` for a well-formed address this build does not render, and
 * `resolved` for the real thing.
 */
export function resolveElementIdentity(index, ref, { compositionHash = null } = {}) {
  const parsed = parseElementRef(ref);
  if (!parsed) return { status: 'malformed', ref: typeof ref === 'string' ? ref : null, identity: null };
  if (!index?.elements) return { status: 'unknown', ref, identity: null };
  if (compositionHash && index.compositionHash !== compositionHash) return { status: 'stale', ref, identity: null };
  const identity = index.elements.find((entry) => entry.ref === ref) ?? null;
  return identity ? { status: 'resolved', ref, identity } : { status: 'unknown', ref, identity: null };
}

const RESOLUTION_REASON = {
  malformed: 'is not a valid element address',
  stale: 'refers to an element index the build has moved past',
  unknown: 'does not resolve to an element this build renders',
};

/**
 * Fail closed.
 *
 * An edit whose target cannot be resolved, or whose property the template does
 * not declare editable for that element, is refused here rather than applied
 * hopefully and reviewed later.
 */
export function assertEditableElement(index, ref, property, { compositionHash = null } = {}) {
  const resolution = resolveElementIdentity(index, ref, { compositionHash });
  if (resolution.status !== 'resolved') {
    throw new Error(`Unresolved element identity: ${String(ref)} ${RESOLUTION_REASON[resolution.status]}.`);
  }
  if (!resolution.identity.editableProperties.includes(property)) {
    throw new Error(`Element ${ref} does not expose an editable ${property} property.`);
  }
  return resolution.identity;
}
