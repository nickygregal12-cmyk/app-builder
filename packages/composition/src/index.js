import { createHash } from 'node:crypto';

const COMPOSITION_VERSION = '0.1.0';
const VERIFICATION_RANK = { rejected: 0, candidate: 1, verified: 2, 'user-provided': 3 };
const DEFAULT_SURFACES = {
  'marketing-site': ['Home', 'Services', 'About', 'Contact'],
  'b2b-saas': ['Sign in', 'Dashboard', 'Workspace', 'Settings'],
  'consumer-app': ['Onboarding', 'Home', 'Primary experience', 'Profile and settings'],
  'internal-tool': ['Sign in', 'Dashboard', 'Records', 'Administration'],
  'content-site': ['Home', 'Content index', 'Content detail', 'About'],
  'ai-app': ['Workspace', 'Input', 'Results', 'History and settings'],
};

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function slugify(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null && item !== '') : [];
}

function binding(key, value, origin, refs = {}, generated = false) {
  return {
    key,
    value,
    origin,
    sourceIds: unique(refs.sourceIds ?? []),
    factIds: unique(refs.factIds ?? []),
    entityIds: unique(refs.entityIds ?? []),
    generated,
  };
}

function manifestBinding(key, value) {
  return binding(key, value, 'manifest');
}

function defaultBinding(key, value) {
  return binding(key, value, 'deterministic-default', {}, true);
}

function bestFact(pack, path) {
  return list(pack?.facts)
    .filter((fact) => fact.path === path && fact.verification !== 'rejected')
    .sort((a, b) => (VERIFICATION_RANK[b.verification] ?? 0) - (VERIFICATION_RANK[a.verification] ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;
}

function factBinding(key, pack, path) {
  const fact = bestFact(pack, path);
  if (!fact) return null;
  return binding(key, fact.value, 'knowledge-fact', {
    sourceIds: unique([fact.sourceId, ...list(fact.evidence).map((item) => item.sourceId)]),
    factIds: [fact.id],
  });
}

function profileFieldBinding(key, pack, section, field) {
  const value = pack?.companyProfile?.[section]?.[field];
  if (!value?.value) return null;
  const fact = list(pack?.facts).find((item) => item.id === value.factId);
  return binding(key, value.value, 'knowledge-fact', {
    sourceIds: fact ? unique([fact.sourceId, ...list(fact.evidence).map((item) => item.sourceId)]) : [],
    factIds: value.factId ? [value.factId] : [],
  });
}

function entityBinding(key, pack, field, manifestItems = []) {
  const knowledgeItems = list(pack?.companyProfile?.[field]);
  if (knowledgeItems.length) {
    const seen = new Set();
    const items = knowledgeItems.filter((item) => {
      const marker = JSON.stringify(item.name ?? item.quote ?? item.title ?? item.value ?? item);
      if (seen.has(marker)) return false;
      seen.add(marker);
      return true;
    }).map(({ id, sourceId, provenance, verification, ...data }) => data);
    return binding(key, items, 'knowledge-entity', {
      sourceIds: knowledgeItems.map((item) => item.sourceId),
      entityIds: knowledgeItems.map((item) => item.id),
    });
  }
  if (manifestItems.length) {
    const items = manifestItems.map((item) => typeof item === 'string' ? { name: item } : item);
    return manifestBinding(key, items);
  }
  return null;
}

function serviceAreaBinding(pack, manifest) {
  const areas = list(pack?.companyProfile?.serviceAreas);
  if (areas.length) {
    const factIds = areas.map((item) => item.factId).filter(Boolean);
    const facts = list(pack?.facts).filter((fact) => factIds.includes(fact.id));
    return binding('items', areas.map((item) => ({ name: item.value })), 'knowledge-fact', {
      factIds,
      sourceIds: facts.flatMap((fact) => [fact.sourceId, ...list(fact.evidence).map((item) => item.sourceId)]),
    });
  }
  const locations = list(manifest?.company?.locations);
  return locations.length ? manifestBinding('items', locations.map((name) => ({ name }))) : null;
}

function contactBindings(pack, manifest) {
  const output = [];
  const manifestContact = manifest?.company?.contactDetails ?? {};
  for (const field of ['email', 'phone', 'address']) {
    output.push(profileFieldBinding(field, pack, 'contact', field) ?? (manifestContact[field] ? manifestBinding(field, manifestContact[field]) : null));
  }
  return output.filter(Boolean);
}

function projectDescriptionBinding(pack, manifest) {
  return profileFieldBinding('body', pack, 'identity', 'description')
    ?? factBinding('body', pack, 'identity.description')
    ?? (manifest?.company?.identity?.description ? manifestBinding('body', manifest.company.identity.description) : null)
    ?? (manifest?.project?.primaryGoal ? manifestBinding('body', manifest.project.primaryGoal) : null)
    ?? defaultBinding('body', `Information about ${manifest?.project?.name ?? 'this project'}.`);
}

function companyNameBinding(pack, manifest) {
  return profileFieldBinding('title', pack, 'identity', 'name')
    ?? factBinding('title', pack, 'identity.name')
    ?? manifestBinding('title', manifest?.company?.identity?.name ?? manifest?.project?.name ?? 'Project');
}

function primaryAction(manifest, surfaces, pack) {
  const goals = list(manifest?.company?.conversionGoals).map((item) => String(item).toLowerCase());
  const contact = Object.fromEntries(contactBindings(pack, manifest).map((item) => [item.key, item.value]));
  if (goals.some((goal) => goal.includes('call')) && contact.phone) return { label: 'Call', href: `tel:${String(contact.phone).replace(/\s+/g, '')}` };
  if (goals.some((goal) => goal.includes('email')) && contact.email) return { label: 'Email', href: `mailto:${contact.email}` };
  const contactSurface = surfaces.find((surface) => /contact|quote|book/i.test(surface));
  if (contactSurface) return { label: goals.some((goal) => goal.includes('quote')) ? 'Request a quote' : 'Contact', href: `/${slugify(contactSurface)}` };
  const journey = list(manifest?.journeys)[0];
  return journey ? { label: String(journey), href: '#next' } : null;
}

function section(id, type, purpose, bindings, actions = [], assetIds = [], variant = 'default') {
  return { id, type, purpose, bindings: bindings.filter(Boolean), actions, assetIds: unique(assetIds), variant };
}

function hero(pageId, surface, index, manifest, pack, action) {
  const title = index === 0 ? companyNameBinding(pack, manifest) : manifestBinding('title', surface);
  const body = index === 0 || /about/i.test(surface)
    ? projectDescriptionBinding(pack, manifest)
    : defaultBinding('body', `${surface} for ${manifest.project.name}.`);
  const bindings = [manifestBinding('eyebrow', manifest.project.type.replaceAll('-', ' ')), title, body];
  return section(`${pageId}-hero`, 'hero', `Introduce ${surface}`, bindings, action ? [action] : [], [], index === 0 ? 'primary' : 'compact');
}

function servicesSection(pageId, pack, manifest) {
  const items = entityBinding('items', pack, 'services', list(manifest?.company?.services));
  if (!items) return null;
  return section(`${pageId}-services`, 'item-grid', 'Present services or products', [
    manifestBinding('title', 'Services'),
    items,
  ], [], [], 'cards');
}

function proofSection(pageId, pack, manifest) {
  const testimonials = entityBinding('testimonials', pack, 'testimonials');
  const accreditations = entityBinding('accreditations', pack, 'accreditations');
  const manifestProof = list(manifest?.company?.trustSignals);
  const fallback = manifestProof.length ? manifestBinding('items', manifestProof.map((name) => ({ name }))) : null;
  if (!testimonials && !accreditations && !fallback) return null;
  return section(`${pageId}-proof`, 'proof-grid', 'Show source-backed proof and trust evidence', [
    manifestBinding('title', 'Proof and trust'),
    testimonials,
    accreditations,
    fallback,
  ], [], [], 'evidence');
}

function peopleSection(pageId, pack) {
  const items = entityBinding('items', pack, 'people');
  if (!items) return null;
  return section(`${pageId}-people`, 'people-grid', 'Introduce source-backed people or team members', [manifestBinding('title', 'People'), items], [], [], 'cards');
}

function projectsSection(pageId, pack) {
  const items = entityBinding('items', pack, 'projects');
  if (!items) return null;
  return section(`${pageId}-projects`, 'item-grid', 'Present source-backed projects or case studies', [manifestBinding('title', 'Projects'), items], [], [], 'cards');
}

function locationsSection(pageId, pack, manifest) {
  const items = serviceAreaBinding(pack, manifest);
  if (!items) return null;
  return section(`${pageId}-locations`, 'location-list', 'Present confirmed service areas or locations', [manifestBinding('title', 'Locations'), items], [], [], 'list');
}

function contactSection(pageId, pack, manifest) {
  const bindings = contactBindings(pack, manifest);
  if (!bindings.length) return null;
  return section(`${pageId}-contact`, 'contact-panel', 'Present confirmed public contact methods', [manifestBinding('title', 'Contact'), ...bindings], [], [], 'panel');
}

function entitiesSection(pageId, manifest) {
  const entities = list(manifest?.entities);
  if (!entities.length) return null;
  return section(`${pageId}-entities`, 'entity-list', 'Present the primary data or workflow concepts', [
    manifestBinding('title', 'Core workspace'),
    manifestBinding('items', entities.map((name) => ({ name }))),
  ], [], [], 'list');
}

function journeysSection(pageId, manifest) {
  const journeys = list(manifest?.journeys);
  if (!journeys.length) return null;
  return section(`${pageId}-journeys`, 'item-grid', 'Present the core user journeys', [
    manifestBinding('title', 'What you can do'),
    manifestBinding('items', journeys.map((name) => ({ name }))),
  ], [], [], 'features');
}

function contentSection(pageId, pack) {
  const items = list(pack?.content).slice(0, 12).map((item) => ({
    title: item.metadata?.title ?? item.headings?.find((heading) => heading.level === 1)?.text ?? item.kind,
    sourceId: item.sourceId,
  }));
  if (!items.length) return null;
  return section(`${pageId}-content`, 'content-list', 'Present source-backed content records', [
    manifestBinding('title', 'Content'),
    binding('items', items.map(({ sourceId, ...item }) => item), 'knowledge-entity', { sourceIds: items.map((item) => item.sourceId) }),
  ], [], [], 'list');
}

function ctaSection(pageId, manifest, action) {
  if (!action) return null;
  return section(`${pageId}-cta`, 'cta', 'Provide the primary next action', [
    defaultBinding('title', 'Next step'),
    manifestBinding('body', manifest.project.primaryGoal),
  ], [action], [], 'accent');
}

function sectionsForPage({ surface, pageId, index, manifest, pack, action }) {
  const lower = surface.toLowerCase();
  const output = [hero(pageId, surface, index, manifest, pack, action)];
  const isHome = index === 0 || lower === 'home';

  if (isHome) {
    output.push(servicesSection(pageId, pack, manifest));
    output.push(entitiesSection(pageId, manifest));
    output.push(journeysSection(pageId, manifest));
    output.push(projectsSection(pageId, pack));
    output.push(proofSection(pageId, pack, manifest));
    output.push(locationsSection(pageId, pack, manifest));
    output.push(contactSection(pageId, pack, manifest));
  } else if (/service|product|offering/.test(lower)) {
    output.push(servicesSection(pageId, pack, manifest));
    output.push(projectsSection(pageId, pack));
  } else if (/about|team|people/.test(lower)) {
    output.push(section(`${pageId}-about`, 'rich-text', 'Describe the organisation using approved or source-backed information', [manifestBinding('title', 'About'), projectDescriptionBinding(pack, manifest)], [], [], 'prose'));
    output.push(peopleSection(pageId, pack));
    output.push(proofSection(pageId, pack, manifest));
  } else if (/location|area/.test(lower)) {
    output.push(locationsSection(pageId, pack, manifest));
  } else if (/contact|quote|book/.test(lower)) {
    output.push(contactSection(pageId, pack, manifest));
  } else if (/content|article|post|news|detail/.test(lower)) {
    output.push(contentSection(pageId, pack));
  } else if (/dashboard|workspace|record|experience|input|result|history|admin|setting|profile/.test(lower)) {
    output.push(entitiesSection(pageId, manifest));
    output.push(journeysSection(pageId, manifest));
  } else {
    output.push(journeysSection(pageId, manifest));
    output.push(entitiesSection(pageId, manifest));
  }

  if (!/contact|quote|book/.test(lower)) output.push(ctaSection(pageId, manifest, action));
  return output.filter(Boolean).filter((item, position, all) => all.findIndex((candidate) => candidate.id === item.id) === position);
}

function surfacesFor(manifest) {
  const explicit = list(manifest?.majorSurfaces).map(String).filter(Boolean);
  return explicit.length ? explicit : [...(DEFAULT_SURFACES[manifest?.project?.type] ?? ['Home'])];
}

function warningsFor(manifest, pack) {
  const warnings = [];
  if (manifest?.schemaVersion !== 2) warnings.push('manifest-v2-not-provided');
  if (!pack) warnings.push('knowledge-pack-not-provided');
  if (manifest?.project?.type === 'marketing-site') {
    if (!list(pack?.companyProfile?.services).length && !list(manifest?.company?.services).length) warnings.push('missing-services');
    const contacts = contactBindings(pack, manifest);
    if (!contacts.length) warnings.push('missing-contact-details');
  }
  for (const capability of list(manifest?.constraints?.customCapabilities)) warnings.push(`custom-capability:${capability}`);
  for (const capability of list(manifest?.constraints?.unresolvedCapabilities)) warnings.push(`unresolved-capability:${capability}`);
  return unique(warnings);
}

export function composeProject({ manifest, knowledgePack = null } = {}) {
  if (!manifest?.project?.type || !manifest?.project?.name) throw new Error('A project manifest with project.name and project.type is required for composition.');
  const surfaces = surfacesFor(manifest);
  const action = primaryAction(manifest, surfaces, knowledgePack);
  const sections = [];
  const pages = surfaces.map((surface, index) => {
    const slug = index === 0 ? 'home' : slugify(surface);
    const pageId = `page-${slug}`;
    const pageSections = sectionsForPage({ surface, pageId, index, manifest, pack: knowledgePack, action });
    sections.push(...pageSections);
    return {
      id: pageId,
      path: index === 0 ? '/' : `/${slug}`,
      title: index === 0 ? manifest.project.name : surface,
      purpose: index === 0 ? `Introduce ${manifest.project.name} and its primary outcome.` : `Provide the ${surface} surface for ${manifest.project.name}.`,
      navigation: { label: surface, order: index, visible: true },
      primaryAction: action,
      sectionIds: pageSections.map((item) => item.id),
    };
  });
  const base = {
    schemaVersion: 1,
    compositionVersion: COMPOSITION_VERSION,
    projectType: manifest.project.type,
    input: { manifestVersion: manifest.schemaVersion ?? 1, knowledgePackHash: knowledgePack?.packHash ?? null },
    pages,
    sections,
    warnings: warningsFor(manifest, knowledgePack),
  };
  return { ...base, compositionHash: hash(base) };
}

export { COMPOSITION_VERSION };
