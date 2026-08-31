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

/**
 * What a photograph is for, where the pack knows.
 *
 * An asset may declare the role it was produced for. Most packs do not — a
 * company that uploaded a folder of photographs has told the factory nothing
 * about which is which — so every rule below falls through to the previous
 * behaviour when the field is absent, and a pack without roles composes exactly
 * what it composed before.
 *
 * Where the roles *are* known, ignoring them is not neutral. The Ardwell & Roe
 * benchmark supplied a wordmark, a social card, twelve project frames and two
 * founder portraits; the opening picked the wordmark because it was first in
 * the pack, and "Recent work" showed the founders' faces and the social card
 * alongside the buildings. An independent reviewer scored imagery-suitability
 * zero and asked for project photography that was already there.
 */
const NOT_WORK_ROLES = Object.freeze(['brand', 'social', 'portrait']);
const LEAD_ROLES = Object.freeze(['hero', 'project-primary']);

function assetRole(asset) {
  return typeof asset?.role === 'string' ? asset.role : null;
}

/** Imagery of the work itself: never the mark, the share card or a face. */
function workAssets(pack, assetDecisions) {
  const assets = publishableAssets(pack, assetDecisions);
  const roled = assets.filter((asset) => assetRole(asset));
  if (!roled.length) return assets;
  return assets.filter((asset) => !NOT_WORK_ROLES.includes(assetRole(asset)));
}

function leadAsset(pack, assetDecisions) {
  const assets = publishableAssets(pack, assetDecisions);
  const work = workAssets(pack, assetDecisions);
  // A declared lead frame first, then anything wide enough to open a page, then
  // any picture of the work. `assets[0]` remains the last resort, because a pack
  // that says nothing about its assets still has to open with something.
  return work.find((asset) => LEAD_ROLES.includes(assetRole(asset)) && assetCrop(asset, 'hero-16x9'))
    ?? work.find((asset) => LEAD_ROLES.includes(assetRole(asset)))
    ?? work.find((asset) => assetCrop(asset, 'hero-16x9'))
    ?? work[0]
    ?? assets[0]
    ?? null;
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
  // Only the first character is touched. Lowercasing the rest read as tidier
  // prose and silently recased the business's own facts: MGB Decor's "Ames
  // taping" was published as "ames taping". A service name is a supplied fact,
  // and a sentence is not a good enough reason to rewrite one.
  return defaultBinding('body', `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}${where}.`);
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

/**
 * The ways a visitor can be handed to the business, in the order a goal can be
 * matched to one.
 *
 * `matches` is tried in this order, so a goal naming two channels — "telephone
 * enquiry" — resolves to the more specific one rather than to whichever regular
 * expression happened to be written first.
 */
const CONVERSION_CHANNELS = [
  {
    id: 'call',
    matches: (goal) => /\bcall\b|phone|telephone|\bring\b/.test(goal),
    unmet: 'no approved telephone number',
    // The number belongs in the label. A column of identical "Call" buttons is
    // what both nbm reviews named, and somebody deciding whether to ring a
    // practice wants to read the number before committing to the tap.
    resolve: ({ contact }) => {
      const phone = String(contact.phone ?? '').trim();
      return phone ? { label: `Call ${phone}`, href: `tel:${phone.replace(/\s+/g, '')}` } : null;
    },
  },
  {
    id: 'email',
    matches: (goal) => /e-?mail/.test(goal),
    unmet: 'no approved email address',
    resolve: ({ contact }) => {
      const email = String(contact.email ?? '').trim();
      return email ? { label: `Email ${email}`, href: `mailto:${email}` } : null;
    },
  },
  {
    id: 'enquiry',
    matches: (goal) => /form|enquir|inquir|quote|book|appointment|message|contact/.test(goal),
    unmet: 'no contact, quote or booking surface to send the visitor to',
    resolve: ({ contactSurface, goal }) => {
      if (!contactSurface) return null;
      const label = /quote/.test(goal) ? 'Request a quote'
        : /book|appointment/.test(goal) ? 'Book an appointment'
        : /form|enquir|inquir|message/.test(goal) ? 'Send an enquiry'
        : 'Contact';
      return { label, href: `/${slugify(contactSurface)}` };
    },
  },
];

/**
 * Resolve every declared conversion goal against what the approved truth backs.
 *
 * This replaced `primaryAction`, which answered the question once for the whole
 * site: it returned on the first goal that matched, so a pack declaring call,
 * email and contact form published one identical Call button on every page and
 * discarded the other two without recording that it had. Two declared
 * requirements reached the manifest and left no trace in the product — the same
 * silent-drop shape as `constraints.hard`.
 *
 * A goal now lands in exactly one of two places. Either it is satisfied, and
 * composition can put that channel where it belongs, or it is unsupported and
 * carries the reason it could not be met, which `warningsFor` publishes the way
 * `declaredProofGap` publishes a proof kind that was promised and never
 * arrived. What a goal may not do is disappear.
 *
 * Resolving is not the same as rendering. This returns what is *available*;
 * where each channel appears is a composition decision, and putting all of them
 * on every section would answer one review finding by creating a worse one.
 */
function conversionPlan(manifest, surfaces, pack) {
  const declared = list(manifest?.company?.conversionGoals).map((item) => String(item).trim()).filter(Boolean);
  const contact = Object.fromEntries(contactBindings(pack, manifest).map((item) => [item.key, item.value]));
  const contactSurface = surfaces.find((surface) => /contact|quote|book/i.test(surface)) ?? null;
  const context = { contact, contactSurface };
  const actions = [];
  const unsupported = [];

  for (const declaredGoal of declared) {
    const goal = declaredGoal.toLowerCase();
    const channel = CONVERSION_CHANNELS.find((entry) => entry.matches(goal));
    if (!channel) {
      unsupported.push({ goal: declaredGoal, reason: 'no conversion channel implements this goal' });
      continue;
    }
    // Two goals can name one channel — "email" and "email enquiry". The channel
    // is placed once, and the duplicate is neither a second button nor a gap.
    if (actions.some((entry) => entry.channel === channel.id)) continue;
    const action = channel.resolve({ ...context, goal });
    if (action) actions.push({ goal: declaredGoal, channel: channel.id, ...action });
    else unsupported.push({ goal: declaredGoal, reason: channel.unmet });
  }

  // Declaring nothing is not the same as wanting nothing: a manifest that never
  // answered the conversion question still needs somewhere for a visitor to go.
  // This is the old fallback chain, unchanged, and it runs only when the
  // operator expressed no preference at all.
  if (!declared.length) {
    for (const id of ['enquiry', 'email', 'call']) {
      const channel = CONVERSION_CHANNELS.find((entry) => entry.id === id);
      const action = channel.resolve({ ...context, goal: '' });
      if (!action) continue;
      actions.push({ goal: null, channel: id, ...action });
      break;
    }
  }

  // Deliberately no journey fallback: a journey is an internal acceptance item
  // and "#next" was never a real destination.
  return { actions, unsupported };
}

/**
 * A placed action carries only what a section spec may hold.
 *
 * `schemas/section-spec.schema.json` closes the action object to label and
 * href, and the channel and goal a plan entry also knows are working state, not
 * published content. Stripping here rather than at every call site keeps a
 * plan entry from reaching a composition by accident.
 */
function placedAction({ label, href }) {
  return { label, href };
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

function hero(pageId, surface, index, manifest, pack, actions, assetDecisions) {
  const title = index === 0 ? companyNameBinding(pack, manifest) : manifestBinding('title', surface);
  // A secondary page says what it is in its heading. "Work for MGB Decor."
  // adds nothing and reads as unfinished.
  //
  // An About surface used to be excepted, which printed the description twice:
  // once here and again immediately below in the `-about` rich-text section
  // that exists to carry exactly that copy. Two independent reviews read the
  // result as repeated registration text and thin, padded pages. The
  // description belongs to the section that owns it.
  const body = index === 0 ? projectDescriptionBinding(pack, manifest) : null;
  // No eyebrow. It previously carried the project type, which published a
  // Build Contract field — "marketing site" — as a caption above the business
  // name on every page.
  const lead = index === 0 ? leadAsset(pack, assetDecisions) : null;
  return section(`${pageId}-hero`, 'hero', `Introduce ${surface}`, [title, body], actions, lead ? [lead.id] : [], index === 0 ? 'primary' : 'compact');
}

/**
 * How much of a set the home page shows.
 *
 * The home page composed every section it could and every item in each of them.
 * That is right for a business with four services and nothing else; the Ardwell
 * & Roe benchmark has ten services, six projects, twelve photographs and nine
 * pieces of proof, and the home page became 9,217px of full inventory while a
 * dedicated page for the same content sat one click away carrying an identical
 * list. Two independent reviews asked for the same thing: stop stacking the
 * whole desktop content inventory, and let the page summarise.
 *
 * A preview only where there is somewhere to go. A business whose surfaces do
 * not include a page for its work has nowhere else to show it, so its home page
 * still shows everything — capping there would hide content rather than defer
 * it.
 */
const HOME_PREVIEW = Object.freeze({ services: 6, projects: 3, gallery: 6, proof: 4 });

function previewOf(binding, limit) {
  if (!binding || !Array.isArray(binding.value) || !limit || binding.value.length <= limit) return binding;
  return { ...binding, value: binding.value.slice(0, limit) };
}

function servicesSection(pageId, pack, manifest, limit = null) {
  const full = entityBinding('items', pack, 'services', list(manifest?.company?.services));
  if (!full) return null;
  const items = previewOf(full, limit);
  return section(`${pageId}-services`, 'item-grid', 'Present services or products', [
    manifestBinding('title', 'Services'),
    items,
  ], [], [], itemVariant(items.value));
}

// `company.trustSignals` is the intake question "What proof can we use?" — a
// closed list of the *kinds* of evidence the operator says exist. It is an
// inventory, not the evidence. Publishing it rendered a proof card reading
// "case studies" on the nbm build: configuration displayed as content, and an
// unsupported trust claim in the one section that exists to support claims.
//
// The declaration still matters. It is what tells the factory that proof was
// promised and never arrived, which `declaredProofGap` reports.
function proofSection(pageId, pack) {
  const testimonials = entityBinding('testimonials', pack, 'testimonials');
  const accreditations = entityBinding('accreditations', pack, 'accreditations');
  if (!testimonials && !accreditations) return null;
  return section(`${pageId}-proof`, 'proof-grid', 'Show source-backed proof and trust evidence', [
    manifestBinding('title', 'Proof and trust'),
    testimonials,
    accreditations,
    // No variant: `evidence` named a presentation the template never rendered,
    // so it fell through to the renderer's own content-driven choice anyway.
    // `default` says that plainly, and lets each binding keep being shown the
    // way its own items deserve.
  ]);
}

/** Proof kinds the operator declared that no ingested source can back. */
function declaredProofGap(manifest, pack) {
  const declared = list(manifest?.company?.trustSignals)
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => item && item !== 'none');
  if (!declared.length) return [];
  const backing = {
    testimonials: () => list(pack?.companyProfile?.testimonials).length > 0,
    accreditations: () => list(pack?.companyProfile?.accreditations).length > 0,
    awards: () => list(pack?.companyProfile?.accreditations).length > 0,
    'case studies': () => list(pack?.companyProfile?.projects).length > 0,
    'project photos': () => list(pack?.assets).some((asset) => asset.publishUseAllowed),
    'client logos': () => list(pack?.assets).some((asset) => asset.publishUseAllowed),
  };
  // An unrecognised declaration is reported rather than assumed satisfied: the
  // operator said proof exists, and nothing here can show that it does.
  return declared.filter((item) => !(backing[item]?.() ?? false));
}

function peopleSection(pageId, pack) {
  const items = entityBinding('items', pack, 'people');
  if (!items) return null;
  return section(`${pageId}-people`, 'people-grid', 'Introduce source-backed people or team members', [manifestBinding('title', 'People'), items], [], [], itemVariant(items.value));
}

function projectsSection(pageId, pack, limit = null) {
  const full = entityBinding('items', pack, 'projects');
  if (!full) return null;
  const items = previewOf(full, limit);
  return section(`${pageId}-projects`, 'item-grid', 'Present source-backed projects or case studies', [manifestBinding('title', 'Projects'), items], [], [], itemVariant(items.value));
}

function locationsSection(pageId, pack, manifest) {
  const items = serviceAreaBinding(pack, manifest);
  if (!items) return null;
  return section(`${pageId}-locations`, 'location-list', 'Present confirmed service areas or locations', [manifestBinding('title', 'Locations'), items], [], [], itemVariant(items.value));
}

function enquiryFormSection(pageId, manifest) {
  if (manifest?.modules?.['lead-generation'] !== true) return null;
  // No variant: the component renders one way, and naming a presentation the
  // template does not implement put `variant-panel` into the composition, the
  // generated module and element identity, styling nothing.
  return section(`${pageId}-enquiry`, 'enquiry-form', 'Capture enquiries where the capability is installed', [
    manifestBinding('title', 'Send an enquiry'),
  ]);
}

/**
 * The workspace surface where an application keeps its own records.
 *
 * Placed only where the capability is actually installed, like the enquiry
 * form. The composer decides the section belongs on this page; the records
 * recipe owns what it looks like and how it reaches the database, and the
 * tenancy it enforces is the database's, not this section's.
 */
function tenantRecordsSection(pageId, manifest) {
  if (manifest?.modules?.records !== true) return null;
  return section(`${pageId}-records`, 'tenant-records', 'Work with the records this organisation owns', [
    manifestBinding('title', 'Records'),
  ]);
}

/**
 * The files an organisation keeps, on the surface it is worked in.
 *
 * Placed beside the records section and for the same reason: the composer
 * decides the section belongs on this page, and the uploads recipe owns what it
 * looks like and how it reaches storage. The tenancy it enforces is storage's,
 * not this section's.
 */
/**
 * What is scheduled, what this person decided, and where they stand.
 *
 * Placed on the workspace beside the records it belongs with, and for the same
 * reason: a schedule with a deadline is worked in, not summarised. The composer
 * decides the section belongs on this page; the recipe owns what it looks like
 * and how it reaches the database, and the deadline it enforces is the
 * database's, not this section's.
 */
function scheduledDecisionsSection(pageId, manifest) {
  if (manifest?.modules?.['scheduled-decisions'] !== true) return null;
  return section(`${pageId}-scheduled-decisions`, 'scheduled-decisions', 'Decide before the deadline, then see how the decisions settled', [
    manifestBinding('title', 'Schedule'),
  ]);
}

function organisationFilesSection(pageId, manifest) {
  if (manifest?.modules?.uploads !== true) return null;
  return section(`${pageId}-files`, 'organisation-files', 'Keep and retrieve the files this organisation owns', [
    manifestBinding('title', 'Files'),
  ]);
}

/**
 * What has happened that the person has not caught up on.
 *
 * Placed on the surface an application is CAUGHT UP on rather than the one it
 * is worked in. A dashboard summarises and a workspace is worked in, so a
 * notifications panel belongs above the summary a person opens first, while the
 * records and files they act on stay together on the workspace.
 *
 * Placed only where the capability is installed, like the sections beside it.
 * The composer decides the section belongs on this page; the notifications
 * recipe owns what it looks like and how it reaches the database, and the
 * recipient scoping it enforces is the database's, not this section's.
 */
function notificationsSection(pageId, manifest) {
  if (manifest?.modules?.notifications !== true) return null;
  return section(`${pageId}-notifications`, 'notifications', 'Catch up on what has happened in this organisation', [
    manifestBinding('title', 'Notifications'),
  ]);
}

function administrationSection(pageId, manifest) {
  if (manifest?.modules?.admin !== true) return null;
  return section(`${pageId}-administration`, 'administration', 'Expose the platform administration boundary where the capability is installed', [
    manifestBinding('title', 'Administration'),
  ]);
}

function contactSection(pageId, pack, manifest) {
  const bindings = contactBindings(pack, manifest);
  const profiles = socialProfileBinding(pack, manifest);
  if (!bindings.length && !profiles) return null;
  // A panel holding only social profiles is not "Contact" — naming it for what
  // it holds also keeps it from being deduped against a page called Contact.
  const title = bindings.length ? 'Contact' : 'Find us online';
  return section(`${pageId}-contact`, 'contact-panel', 'Present confirmed public contact methods', [manifestBinding('title', title), ...bindings, profiles]);
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

function gallerySection(pageId, pack, manifest, assetDecisions, limit = null) {
  const lead = leadAsset(pack, assetDecisions);
  // The work, not the whole asset inventory.
  const all = workAssets(pack, assetDecisions).filter((asset) => asset.id !== lead?.id);
  const assets = limit && all.length > limit ? all.slice(0, limit) : all;
  const actions = socialWorkActions(pack, manifest);
  if (!assets.length && !actions.length) return null;
  return section(`${pageId}-gallery`, 'gallery', 'Show approved work and point to where the rest of it lives', [
    manifestBinding('title', manifest?.project?.type === 'marketing-site' ? 'Recent work' : 'Gallery'),
    assets.length ? null : defaultBinding('body', 'Recent projects are posted to our social profiles.'),
  ], actions, assets.map((asset) => asset.id));
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

// The closing panel leads with the primary conversion route and offers one
// genuinely different way to reach the business beside it. Two is the limit on
// purpose: a declared goal that reaches composition must not be silently
// dropped, but answering that by printing every channel in every panel would
// replace one review finding with a worse one.
function ctaSection(pageId, pack, manifest, actions, index) {
  if (!actions.length) return null;
  const goals = list(manifest?.company?.conversionGoals).map((item) => String(item).toLowerCase());
  const title = goals.some((goal) => goal.includes('quote')) ? 'Get a quote'
    : goals.some((goal) => goal.includes('book') || goal.includes('appointment')) ? 'Book an appointment'
    : 'Get in touch';
  // The same summary sentence on every page reads as a template rather than a
  // site. The entry page carries it; the rest carry the actions alone.
  return section(`${pageId}-cta`, 'cta', 'Provide the primary next action', [
    defaultBinding('title', title),
    index === 0 ? summaryFromDeclaredFacts(pack, manifest) : null,
  ], actions);
}

/**
 * What a surface is *for*, and the approved truth that answers it.
 *
 * This was a chain of `else if`s testing the surface's name, and the shape of it
 * hid a defect that only showed up once a business declared a rich information
 * architecture. A studio with five source-backed people declared **Studio**, and
 * `studio` appeared in none of the tests, so the page fell through every branch
 * to the application default — journeys and entities, both empty on a marketing
 * site — and shipped with a heading and nothing under it. The same happened to
 * **Expertise** with ten approved services behind it. The truth was ingested,
 * survived into the pack, and had nowhere to be asked for.
 *
 * Written as a table, the vocabulary is the thing being maintained rather than
 * an accident of how the conditions were ordered. Each purpose says which names
 * mean it and which approved truth it consumes, so adding a synonym is a data
 * change and the omissions are visible by reading it.
 *
 * It stays a small vocabulary on purpose. Every builder it calls returns null
 * when its truth is absent, so a purpose can only ever surface material the
 * sources actually carry — matching a name never invents content, and a surface
 * whose truth genuinely does not exist still composes empty and still says so.
 *
 * Order is significant: the first purpose whose names match wins. `coverage`
 * precedes `practice` so that a firm's "Practice areas" is still read as the
 * places it works rather than as a page about the firm.
 */
const SURFACE_PURPOSES = Object.freeze([
  {
    id: 'offering',
    // What the business sells. `expertise`, `capabilit` and `what we do` are the
    // words professional-services firms reach for instead of "Services".
    names: /service|product|offering|expertise|capabilit|discipline|what we do/,
    build: ({ pageId, pack, manifest, push }) => {
      push(servicesSection(pageId, pack, manifest));
      push(projectsSection(pageId, pack));
    },
  },
  {
    id: 'showcase',
    // `work` is bounded deliberately. Unbounded, it also matched **Workspace** —
    // the b2b-saas application surface — which routed it to the portfolio branch,
    // gave it a gallery and a project list it could never fill, and left it
    // carrying no content. `carriesContent` then dropped it as unfillable, so
    // every generated B2B SaaS application has silently shipped without the one
    // surface its own project type declares it is worked in. A marketing site's
    // "Work" and "Our works" still match; "Workspace" no longer does.
    names: /\bworks?\b|gallery|portfolio|project|case stud/,
    build: ({ pageId, pack, manifest, assetDecisions, push }) => {
      push(gallerySection(pageId, pack, manifest, assetDecisions));
      push(projectsSection(pageId, pack));
    },
  },
  {
    id: 'coverage',
    names: /location|area|where we work/,
    build: ({ pageId, pack, manifest, push }) => push(locationsSection(pageId, pack, manifest)),
  },
  {
    id: 'practice',
    // Who the business is. A studio, a practice and a firm are the same surface
    // under three house styles.
    names: /about|team|people|\bstudio\b|\bpractice\b|\bfirm\b|who we are/,
    build: ({ pageId, pack, manifest, push }) => {
      // Only when there is something to say. A description this cannot find used
      // to leave a `rich-text` section carrying nothing but the word "About" —
      // a heading over blank space, which `carriesContent` then counted as
      // content, so the page was never reported empty either. Every other
      // builder returns null without its truth and this one now does too.
      const description = projectDescriptionBinding(pack, manifest);
      if (description) push(section(`${pageId}-about`, 'rich-text', 'Describe the organisation using approved or source-backed information', [manifestBinding('title', 'About'), description]));
      push(peopleSection(pageId, pack));
      push(proofSection(pageId, pack));
    },
  },
  {
    id: 'conversion',
    names: /contact|quote|book/,
    build: ({ pageId, pack, manifest, push }) => {
      push(contactSection(pageId, pack, manifest));
      push(enquiryFormSection(pageId, manifest));
    },
  },
  {
    id: 'library',
    names: /content|article|post|news|detail/,
    build: ({ pageId, pack, push }) => push(contentSection(pageId, pack)),
  },
  {
    id: 'application',
    names: /dashboard|workspace|record|experience|input|result|history|admin|setting|profile/,
    build: ({ pageId, manifest, lower, push }) => {
      // The records surface goes on the workspace rather than on every
      // application page: a dashboard summarises, a workspace is worked in, and
      // putting a full CRUD panel behind Settings would be a filing cabinet in a
      // cupboard. `sectionsForPage` dedupes by id, so a project whose surfaces
      // include both still gets one.
      //
      // Notifications go the other way for the same reason. Catching up is what
      // opening a dashboard is FOR, so the panel sits above the summary rather
      // than beside the work — and it is placed first, because a person who has
      // been told something needs to see it before they start.
      if (/dashboard|notification|activity|alert/.test(lower)) push(notificationsSection(pageId, manifest));
      if (/workspace|record/.test(lower)) push(tenantRecordsSection(pageId, manifest));
      if (/workspace|schedule|decision/.test(lower)) push(scheduledDecisionsSection(pageId, manifest));
      if (/workspace|file|document/.test(lower)) push(organisationFilesSection(pageId, manifest));
      if (/admin|setting/.test(lower)) push(administrationSection(pageId, manifest));
      push(entitiesSection(pageId, manifest));
      push(journeysSection(pageId, manifest));
    },
  },
]);

/** The purpose a surface name declares, or null when its name says nothing. */
export function surfacePurposeFor(surface) {
  const lower = String(surface ?? '').toLowerCase();
  return SURFACE_PURPOSES.find((purpose) => purpose.names.test(lower)) ?? null;
}

function sectionsForPage({ surface, surfaces = [], pageId, index, manifest, pack, heroActions, ctaActions, assetDecisions }) {
  const lower = surface.toLowerCase();
  const output = [hero(pageId, surface, index, manifest, pack, heroActions, assetDecisions)];
  const isHome = index === 0 || lower === 'home';
  const push = (item) => output.push(item);

  if (isHome) {
    // A home page previews what another page carries in full, and carries in
    // full whatever has no page of its own.
    const covered = (id) => list(surfaces).some((name, position) => position > 0 && surfacePurposeFor(name)?.id === id);
    const cap = (id, limit) => (covered(id) ? limit : null);
    output.push(servicesSection(pageId, pack, manifest, cap('offering', HOME_PREVIEW.services)));
    output.push(entitiesSection(pageId, manifest));
    output.push(journeysSection(pageId, manifest));
    output.push(gallerySection(pageId, pack, manifest, assetDecisions, cap('showcase', HOME_PREVIEW.gallery)));
    output.push(projectsSection(pageId, pack, cap('showcase', HOME_PREVIEW.projects)));
    output.push(proofSection(pageId, pack));
    output.push(locationsSection(pageId, pack, manifest));
    output.push(contactSection(pageId, pack, manifest));
  } else {
    const purpose = surfacePurposeFor(surface);
    if (purpose) purpose.build({ pageId, pack, manifest, assetDecisions, lower, push });
    else {
      // A name the vocabulary does not recognise. The application defaults are
      // the only safe guess, and on a marketing site they are empty — which is
      // the honest outcome and is reported as such rather than padded.
      output.push(journeysSection(pageId, manifest));
      output.push(entitiesSection(pageId, manifest));
    }
  }

  if (!/contact|quote|book/.test(lower)) output.push(ctaSection(pageId, pack, manifest, ctaActions, index));
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
// The two cases are not the same, and both are reported. A surface the operator
// declared is their intent, so it is still published — and named as an open
// content gap, `empty-declared-surface`. A surface the factory proposed for
// itself and then could not fill is the factory's own mistake, so it is not
// published at all — shipping it would put a hole in the navigation of every
// generated site whose sources happen to be thin — and it is named
// `unfillable-surface`.
const CHROME_SECTIONS = new Set(['hero', 'cta']);

/**
 * Whether the approved truth could have filled this surface.
 *
 * An empty declared surface has two completely different causes and they were
 * previously indistinguishable. MGB Decor declares **Our Work** and has no
 * project material and no publishable imagery: nothing could fill that page, the
 * warning is honest, and inventing projects to satisfy it would be the worst
 * possible fix. Ardwell & Roe declares **Studio** with five source-backed people
 * behind it: everything needed was present and the composer simply never asked
 * for it.
 *
 * The first is a gap in the sources and belongs to the operator. The second is a
 * defect in the factory. Reporting them with the same words is how the second
 * one survived — it read as "thin input", which is the explanation this whole
 * corpus exists to remove.
 *
 * So an empty declared surface is asked one further question: did the composer
 * recognise what this surface was for at all? A surface whose name matched a
 * purpose was asked the right question and the sources had no answer — that is
 * MGB's case and the warning stands alone. A surface whose name matched nothing
 * was never asked, and that is reported separately as
 * `unrecognised-surface-purpose`, because the fix is in the factory's vocabulary
 * or in the source pack rather than in the operator's expectations.
 *
 * The distinction is deliberately about recognition rather than about how much
 * truth exists. Asking "could some purpose have filled this?" would have to
 * guess which purpose, and a guess is exactly how a page ends up padded with
 * whatever material was nearest.
 */
function surfacePurposeRecognised(surface) {
  return surfacePurposeFor(surface) !== null;
}

/**
 * What a page actually offers, as against what it is called.
 *
 * Two surface names can resolve to the same purpose — "Work" and "Project
 * story" both read as the portfolio — and the composer then builds the same
 * sections from the same sources twice and publishes both. Ardwell & Roe
 * shipped `/work` and `/project-story` carrying an identical gallery and an
 * identical project list, and two independent reviews said so in the same
 * words: give them genuinely different purposes, or stop publishing the same
 * page twice.
 *
 * Nobody declared "publish this twice". A surface whose name the operator
 * approved is still honoured wherever it composes something of its own; this
 * only catches the case where it composes nothing another page has not already
 * said, which is a duplicate rather than an intention.
 *
 * Compared on rendered content rather than on section type, so two pages that
 * happen to share a shape but say different things both survive.
 */
function pageContentSignature(pageSections) {
  return JSON.stringify(pageSections
    .filter((item) => !CHROME_SECTIONS.has(item.type))
    .map((item) => [item.type, item.bindings.map((entry) => [entry.key, entry.value]), item.assetIds]));
}

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

function warningsFor(manifest, pack, assetDecisions, plan) {
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
  for (const signal of declaredProofGap(manifest, pack)) warnings.push(`declared-proof-missing:${signal}`);
  // A conversion goal the approved truth cannot back is reported, never
  // dropped. nbm declares call, email and contact form and has no approved
  // email address, so "email" is a real gap in the sources and not a defect the
  // composer can design its way around.
  for (const gap of plan.unsupported) warnings.push(`declared-conversion-unsupported:${gap.goal}`);
  for (const capability of list(manifest?.constraints?.customCapabilities)) warnings.push(`custom-capability:${capability}`);
  for (const capability of list(manifest?.constraints?.unresolvedCapabilities)) warnings.push(`unresolved-capability:${capability}`);
  return unique(warnings);
}

/**
 * The recovery surface.
 *
 * Deliberately says nothing about the business: it is reached by accident, and
 * anything it claimed would be a claim nobody asked a source to back. It is out
 * of navigation by design, which is why the orphan-page and content-less-page
 * checks exempt it.
 */
function notFoundPage(order) {
  const action = { label: 'Back to home', href: '/' };
  const hero = section('page-not-found-hero', 'hero', 'Tell the visitor the page does not exist and offer a way back', [
    defaultBinding('title', 'Page not found'),
    defaultBinding('body', 'That address does not match a page on this site. It may have moved, or the link may be wrong.'),
  ], [action], [], 'compact');
  return {
    sections: [hero],
    page: {
      id: 'page-not-found',
      path: '/404',
      title: 'Page not found',
      purpose: 'Recover from a link that does not resolve.',
      navigation: { label: 'Not found', order, visible: false },
      primaryAction: action,
      sectionIds: [hero.id],
    },
  };
}

export function composeProject({ manifest, knowledgePack = null, assetDecisions = [] } = {}) {
  if (!manifest?.project?.type || !manifest?.project?.name) throw new Error('A project manifest with project.name and project.type is required for composition.');
  const surfaces = surfacesFor(manifest);
  const plan = conversionPlan(manifest, surfaces.map((surface) => surface.name), knowledgePack);
  const sections = [];
  const unfillable = [];
  const emptyDeclared = [];
  const duplicateSurfaces = [];
  const publishedSignatures = new Map();
  const unrecognisedPurpose = [];
  const pages = [];
  surfaces.forEach((surface, index) => {
    const slug = index === 0 ? 'home' : slugify(surface.name);
    const pageId = `page-${slug}`;
    const path = index === 0 ? '/' : `/${slug}`;
    // A call to action that links to the page the visitor is already on is a
    // dead end, so it is dropped for that page rather than rendered.
    const available = plan.actions.filter((entry) => entry.href !== path).map(placedAction);
    // Where the conversion channels belong is a per-route decision, which is
    // the half `primaryAction` never had. The contact surface is the page
    // somebody opened in order to choose a channel, so it offers all of them.
    // Every other page leads with one and closes with at most two.
    const isContactSurface = /contact|quote|book/i.test(surface.name);
    const heroActions = isContactSurface ? available : available.slice(0, 1);
    const pageSections = sectionsForPage({
      surface: surface.name, surfaces: surfaces.map((entry) => entry.name), pageId, index, manifest, pack: knowledgePack, assetDecisions,
      heroActions,
      ctaActions: available.slice(0, 2),
    });
    // The home page always ships: dropping it would leave the site with no entry.
    if (index > 0 && !carriesContent(pageSections)) {
      if (!surface.declared) {
        unfillable.push(surface.name);
        return;
      }
      // Declared intent still outranks the factory's judgement, so the page is
      // published. Saying nothing about it was the other half of the rule and
      // it was never implemented: MGB Decor declared "Our Work", the run had no
      // publishable imagery and no project material, and a decorating business
      // shipped an empty proof page into its own navigation and sitemap with
      // not one warning attached. A gap the operator has to fix is only a gap
      // they can see.
      emptyDeclared.push(surface.name);
      // Which of the two empty cases this is. Without it, a surface the
      // composer never understood is indistinguishable from one the sources
      // could not support, and the first reads as thin input.
      if (!surfacePurposeRecognised(surface.name)) unrecognisedPurpose.push(surface.name);
    }
    // A surface that composes nothing another page has not already said is a
    // duplicate, not a second intention.
    const signature = pageContentSignature(pageSections);
    if (index > 0 && signature !== '[]' && publishedSignatures.has(signature)) {
      duplicateSurfaces.push(`${surface.name} (same content as ${publishedSignatures.get(signature)})`);
      return;
    }
    // The home page is not a duplicate of anything: it previews what the
    // dedicated pages carry, and where a business has few enough items the
    // preview *is* the full set. A destination in the navigation still has to
    // exist. Only two dedicated surfaces saying the same thing is the defect.
    if (index > 0 && signature !== '[]') publishedSignatures.set(signature, surface.name);

    sections.push(...pageSections);
    pages.push({
      id: pageId,
      path,
      title: index === 0 ? manifest.project.name : surface.name,
      // Navigation order stays the surface's own position so removing an
      // unfillable surface never reshuffles the ones that remain.
      purpose: index === 0 ? `Introduce ${manifest.project.name} and its primary outcome.` : `Provide the ${surface.name} surface for ${manifest.project.name}.`,
      navigation: { label: surface.name, order: index, visible: true },
      // Still exactly one: `page.primaryAction` is what the launch audit walks a
      // journey from, and a page with several entry points is several journeys
      // only if something asks for them. The rest of the channels are on the
      // sections, where the audit already reads them.
      primaryAction: available[0] ?? null,
      sectionIds: pageSections.map((item) => item.id),
    });
  });
  // Every generated site needs somewhere for a bad link to land. Without one
  // the router fell through to the home page, so a mistyped or retired URL
  // showed the homepage under the wrong address with nothing to tell the
  // visitor — or a search engine — that the page did not exist.
  const notFound = notFoundPage(pages.length);
  sections.push(...notFound.sections);
  pages.push(notFound.page);

  const base = {
    schemaVersion: 1,
    compositionVersion: COMPOSITION_VERSION,
    projectType: manifest.project.type,
    input: { manifestVersion: manifest.schemaVersion ?? 1, knowledgePackHash: knowledgePack?.packHash ?? null, assetDecisionsHash: assetDecisionsHash(assetDecisions) },
    pages,
    sections,
    warnings: [
      ...warningsFor(manifest, knowledgePack, assetDecisions, plan),
      ...unfillable.map((name) => `unfillable-surface:${name}`),
      ...emptyDeclared.map((name) => `empty-declared-surface:${name}`),
      ...duplicateSurfaces.map((name) => `duplicate-surface:${name}`),
      ...unrecognisedPurpose.map((name) => `unrecognised-surface-purpose:${name}`),
    ],
  };
  return { ...base, compositionHash: hash(base) };
}

/**
 * Remove human edits, returning the composition the factory would have produced.
 *
 * The hash is recomputed: a composition whose hash describes different content
 * than it holds is worse than no hash at all.
 */
/**
 * Recompute the hash after a transform changed what a composition holds.
 *
 * A composition whose hash describes different content than it holds is worse
 * than no hash at all, and three transforms now need to say so. Exporting it
 * keeps the hashing rule in the one place that defines it rather than in every
 * caller that reshapes a composition.
 */
export function rehashComposition(composition) {
  const base = { ...composition };
  delete base.compositionHash;
  return { ...base, compositionHash: hash(base) };
}

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
