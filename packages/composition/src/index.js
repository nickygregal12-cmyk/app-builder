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
    }).map((item) => Object.fromEntries(Object.entries(item).filter(([fieldName]) => !['id', 'sourceId', 'provenance', 'verification'].includes(fieldName))));
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

// The composition records which decisions produced it, so a decision made
// after a build is visibly newer than the build rather than silently ignored.
export function assetDecisionsHash(assetDecisions) {
  const entries = list(assetDecisions)
    .filter((entry) => entry?.assetId && entry?.effect)
    .map((entry) => [entry.assetId, entry.effect, entry.cropReview ?? 'pending', entry.focalPoint ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return entries.length ? hash(entries) : null;
}

function decisionsById(assetDecisions) {
  return new Map(list(assetDecisions).filter((entry) => entry?.assetId && entry?.effect).map((entry) => [entry.assetId, entry]));
}

function decidedAssets(pack, assetDecisions) {
  const decisions = decisionsById(assetDecisions);
  if (!decisions.size) return list(pack?.assets);
  return list(pack?.assets).map((asset) => {
    const decision = decisions.get(asset.id);
    return decision ? { ...asset, ...decision.effect } : asset;
  });
}

/**
 * Only assets the business has approved for publication can be placed. An asset
 * that is reference-only, rejected or awaiting approval stays out of the
 * generated site regardless of how good it looks.
 *
 * A per-asset decision overrides what the asset inherited from its source, in
 * both directions: a photograph on an approved source can be turned down, and
 * one on a reference-only source can be published once someone has declared the
 * rights for that asset specifically. The rules that decide whether a decision
 * is allowed live with source governance; what arrives here is the resolved
 * effect, so composition stays a pure function of its inputs.
 */
function publishableAssets(pack, assetDecisions) {
  return decidedAssets(pack, assetDecisions).filter((asset) => asset.publishUseAllowed && !asset.duplicateOf);
}

function assetCrop(asset, role) {
  return list(asset.variants).find((variant) => variant.role === role) ?? null;
}

function leadAsset(pack, assetDecisions) {
  const assets = publishableAssets(pack, assetDecisions);
  return assets.find((asset) => assetCrop(asset, 'hero-16x9')) ?? assets[0] ?? null;
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

const CONTACT_FIELDS = ['email', 'phone', 'address', 'website'];

function contactBindings(pack, manifest) {
  const manifestContact = manifest?.company?.contactDetails ?? {};
  return CONTACT_FIELDS
    .map((field) => profileFieldBinding(field, pack, 'contact', field) ?? (manifestContact[field] ? manifestBinding(field, manifestContact[field]) : null))
    .filter(Boolean);
}

// A social profile is often the only web presence a small business has, so it
// is a first-class contact route rather than an extra. Rights are irrelevant
// here: linking to a public profile is not republishing its content.
function socialProfileBinding(pack, manifest) {
  const fromKnowledge = list(pack?.companyProfile?.socialProfiles);
  if (fromKnowledge.length) {
    const factIds = fromKnowledge.map((item) => item.factId).filter(Boolean);
    return binding('profiles', fromKnowledge.map((item) => ({ platform: item.platform, url: item.value })), 'knowledge-fact', {
      factIds,
      sourceIds: list(pack?.facts).filter((fact) => factIds.includes(fact.id)).map((fact) => fact.sourceId),
    });
  }
  const declared = list(manifest?.company?.socialProfiles)
    .map((item) => (typeof item === 'string' ? { platform: platformFor(item), url: item } : { platform: item.platform ?? platformFor(item.url), url: item.url }))
    .filter((item) => item.url);
  return declared.length ? manifestBinding('profiles', declared) : null;
}

function platformFor(url) {
  let host = '';
  try { host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'website'; }
  const known = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'x', 'twitter', 'pinterest'];
  return known.find((name) => host === `${name}.com` || host.endsWith(`.${name}.com`)) ?? host;
}

// project.primaryGoal is what the owner wants from the site — "win local
// enquiries" — not something a visitor should ever read. Where no description
// exists, a sentence is assembled from declared services and areas instead;
// it states only what the manifest already asserts and claims nothing extra.
function summaryFromDeclaredFacts(pack, manifest) {
  const services = list(pack?.companyProfile?.services).map((item) => item.name).filter(Boolean);
  const declared = services.length ? services : list(manifest?.company?.services).map(String);
  const areas = list(pack?.companyProfile?.serviceAreas).map((item) => item.value).filter(Boolean);
  const locations = areas.length ? areas : list(manifest?.company?.locations).map(String);
  if (!declared.length) return null;
  const phrase = declared.length === 1
    ? declared[0]
    : `${declared.slice(0, -1).join(', ')} and ${declared.at(-1)}`;
  const where = locations.length ? ` in ${locations.length === 1 ? locations[0] : `${locations.slice(0, -1).join(', ')} and ${locations.at(-1)}`}` : '';
  return defaultBinding('body', `${phrase.charAt(0).toUpperCase()}${phrase.slice(1).toLowerCase()}${where}.`);
}

function projectDescriptionBinding(pack, manifest) {
  return profileFieldBinding('body', pack, 'identity', 'description')
    ?? factBinding('body', pack, 'identity.description')
    ?? (manifest?.company?.identity?.description ? manifestBinding('body', manifest.company.identity.description) : null)
    ?? summaryFromDeclaredFacts(pack, manifest);
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
  if (contact.email) return { label: 'Email', href: `mailto:${contact.email}` };
  if (contact.phone) return { label: 'Call', href: `tel:${String(contact.phone).replace(/\s+/g, '')}` };
  // Deliberately no journey fallback: a journey is an internal acceptance item
  // and "#next" was never a real destination.
  return null;
}

// Items with nothing but a name are a list, not a grid of tall empty cards. The
// composer knows which it has, so the variant it records is the one that suits
// the content rather than a hint the template has to second-guess.
const NAME_FIELDS = ['name', 'title', 'quote', 'value', 'label'];

function itemVariant(items) {
  const detailed = list(items).some((item) => item && typeof item === 'object' && !Array.isArray(item)
    && Object.entries(item).some(([key, value]) => !NAME_FIELDS.includes(key) && ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim()));
  return detailed ? 'cards' : 'list';
}

function section(id, type, purpose, bindings, actions = [], assetIds = [], variant = 'default') {
  return { id, type, purpose, bindings: bindings.filter(Boolean), actions, assetIds: unique(assetIds), variant };
}

function hero(pageId, surface, index, manifest, pack, action, assetDecisions) {
  const title = index === 0 ? companyNameBinding(pack, manifest) : manifestBinding('title', surface);
  // A secondary page says what it is in its heading. "Work for MGB Decor."
  // adds nothing and reads as unfinished.
  const body = index === 0 || /about/i.test(surface) ? projectDescriptionBinding(pack, manifest) : null;
  // No eyebrow. It previously carried the project type, which published a
  // Build Contract field — "marketing site" — as a caption above the business
  // name on every page.
  const lead = index === 0 ? leadAsset(pack, assetDecisions) : null;
  return section(`${pageId}-hero`, 'hero', `Introduce ${surface}`, [title, body], action ? [action] : [], lead ? [lead.id] : [], index === 0 ? 'primary' : 'compact');
}

function servicesSection(pageId, pack, manifest) {
  const items = entityBinding('items', pack, 'services', list(manifest?.company?.services));
  if (!items) return null;
  return section(`${pageId}-services`, 'item-grid', 'Present services or products', [
    manifestBinding('title', 'Services'),
    items,
  ], [], [], itemVariant(items.value));
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
  return section(`${pageId}-people`, 'people-grid', 'Introduce source-backed people or team members', [manifestBinding('title', 'People'), items], [], [], itemVariant(items.value));
}

function projectsSection(pageId, pack) {
  const items = entityBinding('items', pack, 'projects');
  if (!items) return null;
  return section(`${pageId}-projects`, 'item-grid', 'Present source-backed projects or case studies', [manifestBinding('title', 'Projects'), items], [], [], itemVariant(items.value));
}

function locationsSection(pageId, pack, manifest) {
  const items = serviceAreaBinding(pack, manifest);
  if (!items) return null;
  return section(`${pageId}-locations`, 'location-list', 'Present confirmed service areas or locations', [manifestBinding('title', 'Locations'), items], [], [], itemVariant(items.value));
}

function enquiryFormSection(pageId, manifest) {
  if (manifest?.modules?.['lead-generation'] !== true) return null;
  return section(`${pageId}-enquiry`, 'enquiry-form', 'Capture enquiries where the capability is installed', [
    manifestBinding('title', 'Send an enquiry'),
  ], [], [], 'panel');
}

function contactSection(pageId, pack, manifest) {
  const bindings = contactBindings(pack, manifest);
  const profiles = socialProfileBinding(pack, manifest);
  if (!bindings.length && !profiles) return null;
  // A panel holding only social profiles is not "Contact" — naming it for what
  // it holds also keeps it from being deduped against a page called Contact.
  const title = bindings.length ? 'Contact' : 'Find us online';
  return section(`${pageId}-contact`, 'contact-panel', 'Present confirmed public contact methods', [manifestBinding('title', title), ...bindings, profiles], [], [], 'panel');
}

function entitiesSection(pageId, manifest) {
  const entities = list(manifest?.entities);
  if (!entities.length) return null;
  return section(`${pageId}-entities`, 'entity-list', 'Present the primary data or workflow concepts', [
    manifestBinding('title', 'Core workspace'),
    manifestBinding('items', entities.map((name) => ({ name }))),
  ], [], [], 'list');
}

// Where a business keeps its portfolio on social media, the site should send
// people there rather than pretend the handful of images it holds is the whole
// body of work.
function socialWorkActions(pack, manifest) {
  const profiles = socialProfileBinding(pack, manifest);
  const values = Array.isArray(profiles?.value) ? profiles.value : [];
  return values
    .filter((profile) => ['instagram', 'facebook'].includes(String(profile.platform)))
    .map((profile) => ({ label: `More work on ${String(profile.platform).replace(/^./, (letter) => letter.toUpperCase())}`, href: profile.url }));
}

function gallerySection(pageId, pack, manifest, assetDecisions) {
  const lead = leadAsset(pack, assetDecisions);
  const assets = publishableAssets(pack, assetDecisions).filter((asset) => asset.id !== lead?.id);
  const actions = socialWorkActions(pack, manifest);
  if (!assets.length && !actions.length) return null;
  return section(`${pageId}-gallery`, 'gallery', 'Show approved work and point to where the rest of it lives', [
    manifestBinding('title', manifest?.project?.type === 'marketing-site' ? 'Recent work' : 'Gallery'),
    assets.length ? null : defaultBinding('body', 'Recent projects are posted to our social profiles.'),
  ], actions, assets.map((asset) => asset.id), 'grid');
}

// Journeys describe what a product lets a user do, which is real content for an
// application surface. On a published business or content site they are visitor
// intents recorded during intake — "Understand what the company does" — and
// must never be rendered as website copy.
const PUBLISHED_SITE_TYPES = new Set(['marketing-site', 'content-site']);

function journeysSection(pageId, manifest) {
  if (PUBLISHED_SITE_TYPES.has(manifest?.project?.type)) return null;
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
    binding('items', items.map((item) => ({ title: item.title })), 'knowledge-entity', { sourceIds: items.map((item) => item.sourceId) }),
  ], [], [], 'list');
}

function ctaSection(pageId, pack, manifest, action) {
  if (!action) return null;
  const goals = list(manifest?.company?.conversionGoals).map((item) => String(item).toLowerCase());
  const title = goals.some((goal) => goal.includes('quote')) ? 'Get a quote'
    : goals.some((goal) => goal.includes('book') || goal.includes('appointment')) ? 'Book an appointment'
    : 'Get in touch';
  return section(`${pageId}-cta`, 'cta', 'Provide the primary next action', [
    defaultBinding('title', title),
    summaryFromDeclaredFacts(pack, manifest),
  ], [action], [], 'accent');
}

function sectionsForPage({ surface, pageId, index, manifest, pack, action, assetDecisions }) {
  const lower = surface.toLowerCase();
  const output = [hero(pageId, surface, index, manifest, pack, action, assetDecisions)];
  const isHome = index === 0 || lower === 'home';

  if (isHome) {
    output.push(servicesSection(pageId, pack, manifest));
    output.push(entitiesSection(pageId, manifest));
    output.push(journeysSection(pageId, manifest));
    output.push(gallerySection(pageId, pack, manifest, assetDecisions));
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
  } else if (/work|gallery|portfolio|project/.test(lower)) {
    output.push(gallerySection(pageId, pack, manifest, assetDecisions));
    output.push(projectsSection(pageId, pack));
  } else if (/location|area/.test(lower)) {
    output.push(locationsSection(pageId, pack, manifest));
  } else if (/contact|quote|book/.test(lower)) {
    output.push(contactSection(pageId, pack, manifest));
    output.push(enquiryFormSection(pageId, manifest));
  } else if (/content|article|post|news|detail/.test(lower)) {
    output.push(contentSection(pageId, pack));
  } else if (/dashboard|workspace|record|experience|input|result|history|admin|setting|profile/.test(lower)) {
    output.push(entitiesSection(pageId, manifest));
    output.push(journeysSection(pageId, manifest));
  } else {
    output.push(journeysSection(pageId, manifest));
    output.push(entitiesSection(pageId, manifest));
  }

  if (!/contact|quote|book/.test(lower)) output.push(ctaSection(pageId, pack, manifest, action));
  const unique = output.filter(Boolean).filter((item, position, all) => all.findIndex((candidate) => candidate.id === item.id) === position);
  return dropRepeatedHeading(unique);
}

// A page named Contact does not need a section also headed "Contact" directly
// beneath it. The section keeps its identity and content; only the duplicated
// heading is dropped.
function dropRepeatedHeading(sections) {
  const heroTitle = sections.find((item) => item.type === 'hero')?.bindings.find((item) => item.key === 'title')?.value;
  if (typeof heroTitle !== 'string') return sections;
  return sections.map((item) => {
    if (item.type === 'hero') return item;
    const title = item.bindings.find((entry) => entry.key === 'title');
    if (typeof title?.value !== 'string' || title.value.toLowerCase() !== heroTitle.toLowerCase()) return item;
    return { ...item, bindings: item.bindings.filter((entry) => entry !== title) };
  });
}

function surfacesFor(manifest) {
  const explicit = list(manifest?.majorSurfaces).map(String).filter(Boolean);
  if (explicit.length) return explicit.map((name) => ({ name, declared: true }));
  return [...(DEFAULT_SURFACES[manifest?.project?.type] ?? ['Home'])].map((name) => ({ name, declared: false }));
}

// A page whose only sections are a hero and a call to action is a dead end: the
// visitor arrived from navigation and found nothing they came for.
//
// The two cases are not the same. A surface the operator declared is their
// intent, so it is still published and named as an open content gap. A surface
// the factory proposed for itself and then could not fill is the factory's own
// mistake, so it is not published at all — shipping it would put a hole in the
// navigation of every generated site whose sources happen to be thin.
const CHROME_SECTIONS = new Set(['hero', 'cta']);

function carriesContent(pageSections) {
  return pageSections.some((item) => {
    if (!CHROME_SECTIONS.has(item.type)) return true;
    if (item.type !== 'hero') return false;
    return item.bindings.some((entry) => entry.key !== 'title' && !isEmptyBindingValue(entry.value));
  });
}

function isEmptyBindingValue(value) {
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number' || typeof value === 'boolean') return false;
  if (Array.isArray(value)) return value.every(isEmptyBindingValue);
  if (value && typeof value === 'object') return Object.values(value).every(isEmptyBindingValue);
  return true;
}

function warningsFor(manifest, pack, assetDecisions) {
  const warnings = [];
  if (manifest?.schemaVersion !== 2) warnings.push('manifest-v2-not-provided');
  if (!pack) warnings.push('knowledge-pack-not-provided');
  if (manifest?.project?.type === 'marketing-site') {
    if (!list(pack?.companyProfile?.services).length && !list(manifest?.company?.services).length) warnings.push('missing-services');
    const contacts = contactBindings(pack, manifest);
    if (!contacts.length && !socialProfileBinding(pack, manifest)) warnings.push('missing-contact-details');
    // A marketing site with no imagery is not launchable for most business
    // classes, so silence here would be misleading.
    if (!publishableAssets(pack, assetDecisions).length) warnings.push('no-publishable-imagery');
  }
  for (const capability of list(manifest?.constraints?.customCapabilities)) warnings.push(`custom-capability:${capability}`);
  for (const capability of list(manifest?.constraints?.unresolvedCapabilities)) warnings.push(`unresolved-capability:${capability}`);
  return unique(warnings);
}

export function composeProject({ manifest, knowledgePack = null, assetDecisions = [] } = {}) {
  if (!manifest?.project?.type || !manifest?.project?.name) throw new Error('A project manifest with project.name and project.type is required for composition.');
  const surfaces = surfacesFor(manifest);
  const projectAction = primaryAction(manifest, surfaces.map((surface) => surface.name), knowledgePack);
  const sections = [];
  const unfillable = [];
  const pages = [];
  surfaces.forEach((surface, index) => {
    const slug = index === 0 ? 'home' : slugify(surface.name);
    const pageId = `page-${slug}`;
    const path = index === 0 ? '/' : `/${slug}`;
    // A call to action that links to the page the visitor is already on is a
    // dead end, so it is dropped for that page rather than rendered.
    const action = projectAction && projectAction.href === path ? null : projectAction;
    const pageSections = sectionsForPage({ surface: surface.name, pageId, index, manifest, pack: knowledgePack, action, assetDecisions });
    // The home page always ships: dropping it would leave the site with no entry.
    if (index > 0 && !surface.declared && !carriesContent(pageSections)) {
      unfillable.push(surface.name);
      return;
    }
    sections.push(...pageSections);
    pages.push({
      id: pageId,
      path,
      title: index === 0 ? manifest.project.name : surface.name,
      // Navigation order stays the surface's own position so removing an
      // unfillable surface never reshuffles the ones that remain.
      purpose: index === 0 ? `Introduce ${manifest.project.name} and its primary outcome.` : `Provide the ${surface.name} surface for ${manifest.project.name}.`,
      navigation: { label: surface.name, order: index, visible: true },
      primaryAction: action,
      sectionIds: pageSections.map((item) => item.id),
    });
  });
  const base = {
    schemaVersion: 1,
    compositionVersion: COMPOSITION_VERSION,
    projectType: manifest.project.type,
    input: { manifestVersion: manifest.schemaVersion ?? 1, knowledgePackHash: knowledgePack?.packHash ?? null, assetDecisionsHash: assetDecisionsHash(assetDecisions) },
    pages,
    sections,
    warnings: [...warningsFor(manifest, knowledgePack, assetDecisions), ...unfillable.map((name) => `unfillable-surface:${name}`)],
  };
  return { ...base, compositionHash: hash(base) };
}

/**
 * Remove human edits, returning the composition the factory would have produced.
 *
 * The hash is recomputed: a composition whose hash describes different content
 * than it holds is worse than no hash at all.
 */
export function stripContentOverrides(composition) {
  let restored = 0;
  const sections = composition.sections.map((section) => ({
    ...section,
    bindings: section.bindings.map((entry) => {
      if (!entry.overriddenFrom) return entry;
      restored += 1;
      const { overriddenFrom, ...rest } = entry;
      return { ...rest, value: overriddenFrom.value, origin: overriddenFrom.origin, generated: overriddenFrom.origin === 'deterministic-default' };
    }),
  }));
  if (!restored) return composition;
  const base = { ...composition, sections };
  delete base.compositionHash;
  return { ...base, compositionHash: hash(base) };
}

/**
 * Apply human edits over a deterministic composition.
 *
 * Composition stays a pure function of manifest and knowledge; edits live
 * beside it and are replayed on top. An edited binding is marked `human` and
 * keeps what it replaced in `overriddenFrom`, so a human sentence can never be
 * mistaken for a source-backed fact and the deterministic value is always
 * recoverable.
 */
export function applyContentOverrides(composition, overrides = []) {
  const bySection = new Map();
  for (const override of list(overrides)) {
    if (!override?.sectionId || !override?.bindingKey) continue;
    const entries = bySection.get(override.sectionId) ?? new Map();
    entries.set(override.bindingKey, override);
    bySection.set(override.sectionId, entries);
  }
  if (!bySection.size) return composition;

  let applied = 0;
  const sections = composition.sections.map((section) => {
    const entries = bySection.get(section.id);
    if (!entries) return section;
    const bindings = section.bindings.map((entry) => {
      const override = entries.get(entry.key);
      if (!override || override.value === entry.value) return entry;
      applied += 1;
      return {
        ...entry,
        value: override.value,
        origin: 'human',
        generated: false,
        overriddenFrom: entry.overriddenFrom ?? { origin: entry.origin, value: entry.value },
      };
    });
    return { ...section, bindings };
  });

  if (!applied) return composition;
  const base = { ...composition, sections };
  delete base.compositionHash;
  return { ...base, compositionHash: hash(base) };
}

/**
 * Apply presentation choices over a deterministic composition.
 *
 * The same shape as content overrides, for the same reason: composition stays a
 * pure function of manifest and knowledge, and a person's decision lives beside
 * it and is replayed on top. The composed variant is kept so the factory's own
 * presentation is always recoverable.
 *
 * Whether a variant is one the template actually renders is decided where the
 * choice is recorded. What arrives here has already been checked.
 */
export function applySectionVariants(composition, choices = []) {
  const wanted = new Map(list(choices).filter((entry) => entry?.sectionId && entry?.variant).map((entry) => [entry.sectionId, entry.variant]));
  if (!wanted.size) return composition;

  let applied = 0;
  const sections = composition.sections.map((section) => {
    const variant = wanted.get(section.id);
    if (!variant || variant === section.variant) return section;
    applied += 1;
    return { ...section, variant, variantOverriddenFrom: section.variantOverriddenFrom ?? section.variant };
  });
  if (!applied) return composition;
  const base = { ...composition, sections };
  delete base.compositionHash;
  return { ...base, compositionHash: hash(base) };
}

/** Remove presentation choices, returning the composition the factory composed. */
export function stripSectionVariants(composition) {
  let restored = 0;
  const sections = composition.sections.map((section) => {
    if (!section.variantOverriddenFrom) return section;
    restored += 1;
    const { variantOverriddenFrom, ...rest } = section;
    return { ...rest, variant: variantOverriddenFrom };
  });
  if (!restored) return composition;
  const base = { ...composition, sections };
  delete base.compositionHash;
  return { ...base, compositionHash: hash(base) };
}

export { COMPOSITION_VERSION };
export {
  assertEditableElement,
  bindingElementKey,
  deriveElementIdentities,
  elementRef,
  parseElementRef,
  resolveElementIdentity,
} from './element-identity.js';
