import { createHash } from 'node:crypto';

/**
 * What pages exist, and why each deserves to exist separately.
 *
 * ## What this replaces
 *
 * The decision was being taken by a literal:
 *
 *     DEFAULT_SURFACES['marketing-site'] = ['Home', 'Services', 'About', 'Contact']
 *
 * and a page's purpose was then recovered by matching a regular expression against its own name —
 * `/admin|setting/` reached the administration sections, `/workspace|record/` reached the records
 * ones. So the route set was fixed before any truth was read, and the semantics were recovered
 * afterwards from a string. Sections were then emitted for everything the truth supported, which
 * is how one rich-truth run composed thirty-one sections over nine thousand pixels and a reviewer
 * reported "effectively duplicate pages".
 *
 * `config/agent-roles.json` has named the missing artifact since the roles were written —
 * `InformationArchitectureSpec`, written by `information-architect`, read by `composition` — with
 * `schema: null` and `status: "planned"`. Ten places in `config/agent-pipelines.json` refer to it.
 * Nothing produced one and nothing consumed one.
 *
 * ## The split: judgement and constraint
 *
 * Strategy is judgement. Which routes a business needs, what a visitor arrives asking, and what
 * order an argument goes in are not derivable, and a model role should eventually propose them.
 *
 * Everything below the strategy is constraint, and constraint is code. Whether a fact reference
 * resolves, whether two routes are really the same route, whether a narrative depends on something
 * that comes later, whether a justification actually says anything — these have answers, and a
 * validator that has them is what makes a proposed plan safe to act on. That division is why the
 * planner here is deterministic and the validators are the part that matters: a model can be
 * swapped in behind `planSite` without any of the guarantees moving.
 *
 * ## What is deliberately absent
 *
 * No target route count. No target section count. No shape quota. No project-type table.
 *
 * A planner that can only ever add structure is a template with a variable in it, so declining is
 * a first-class output: `omitted` records what was considered and refused, and a business with one
 * fact to its name should produce entries there rather than routes padded to a shape.
 */

const PLAN_VERSION = 1;

const list = (value) => (Array.isArray(value) ? value : []);

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

/**
 * Justifications that are shaped like reasons and are not reasons.
 *
 * Every one of these is true of almost any page on almost any site, which is what makes them the
 * sentences a generator reaches for when it has nothing specific to say. Rejecting them is not
 * style policing: a route that cannot say why it exists in terms of this business's own truth has
 * not established that it should exist.
 */
const EMPTY_JUSTIFICATIONS = [
  /provides? useful information/i,
  /builds? trust/i,
  /showcases? (?:our )?services/i,
  /tells? (?:the )?(?:our )?story/i,
  /gives? visitors? more information/i,
  /standard (?:page|section) for/i,
  /best practice/i,
  /every (?:good )?(?:web)?site (?:has|needs)/i,
  /improves? (?:seo|engagement|conversion)/i,
];

/**
 * How much distinct truth a route needs before it can sustain a page.
 *
 * This is a rule about the *truth*, not about the output: it does not say how many pages a site
 * should have, it says a page cannot be built out of nothing. One fact is a sentence, and a
 * sentence belongs in a section of a page that has more to say. The alternative — letting a route
 * exist on a single fact — is how a thin business ends up with a five-page site whose pages are
 * generic copy wrapped around one detail each, which is the failure this whole capability exists
 * to prevent.
 */
const ROUTE_SUFFICIENCY = 2;

/**
 * Every approved thing a plan may point at.
 *
 * A knowledge pack keeps its truth in two stores and they are not interchangeable. `facts[]`
 * carries identity, contact and practice figures; the things a business *has* — its services,
 * projects, people and testimonials — are entities under `companyProfile`, each with its own id.
 * A validator that only knew about `facts` would have accepted a route claiming to be built on
 * ten services while referencing none of them, which is the precise shape of the invention this
 * boundary exists to prevent.
 */
export function knownRefs(knowledgePack) {
  const refs = new Set(list(knowledgePack?.facts).map((fact) => fact.id));
  const profile = knowledgePack?.companyProfile ?? {};
  for (const value of Object.values(profile)) {
    for (const entity of list(value)) if (entity?.id) refs.add(entity.id);
  }
  return refs;
}

/* ------------------------------------------------------------------ validation */

/**
 * Everything about a plan that has an answer, checked.
 *
 * Returns findings rather than throwing, so a caller can report all of them at once. A proposed
 * plan with six problems should not be fixed six times.
 */
export function validateSitePlan(plan, { knowledgePack = null } = {}) {
  const findings = [];
  const fail = (code, detail) => findings.push({ code, detail });

  if (!plan || typeof plan !== 'object') {
    fail('not-a-plan', 'No site plan was supplied.');
    return findings;
  }

  const known = knownRefs(knowledgePack);
  const routes = list(plan.routes);
  if (!routes.length) fail('no-routes', 'A plan with no routes describes no site.');

  const seenPaths = new Set();
  const factSignatures = new Map();

  for (const route of routes) {
    const at = route?.path ?? '(unnamed route)';

    if (seenPaths.has(route?.path)) fail('duplicate-route-path', `Two routes claim ${at}.`);
    seenPaths.add(route?.path);

    // Truth boundary. The planner may reorganise approved knowledge; it may not invent any.
    for (const ref of list(route?.factRefs)) {
      if (known.size && !known.has(ref)) {
        fail('unsupported-fact-reference', `${at} draws on ${ref}, which is not in the approved knowledge pack. A route may reorganise approved truth and may not invent it.`);
      }
    }

    if (list(route?.factRefs).length < ROUTE_SUFFICIENCY) {
      fail('route-truth-too-thin', `${at} rests on ${list(route?.factRefs).length} approved fact(s). A page needs enough to answer its own entry question; below that the truth belongs in a section of another page, or in omitted.`);
    }

    const because = String(route?.existsBecause ?? '');
    const empty = EMPTY_JUSTIFICATIONS.find((pattern) => pattern.test(because));
    if (empty) {
      fail('empty-justification', `${at} justifies itself with a sentence that would be true of almost any page (${empty.source}). Why does this page deserve to exist separately, in terms of this business's own truth?`);
    }

    /*
     * Two routes admitting exactly the same truth are one route rendered twice. This is the
     * check that would have caught the "effectively duplicate pages" finding at the point the
     * pages were decided rather than after they were rendered and reviewed.
     */
    const signature = [...list(route?.factRefs)].sort().join(' ');
    if (signature) {
      if (factSignatures.has(signature)) {
        fail('duplicate-route-truth', `${at} and ${factSignatures.get(signature)} admit exactly the same approved facts, so they are one page rendered twice.`);
      } else {
        factSignatures.set(signature, at);
      }
    }

    const admissible = new Set(list(route?.factRefs));
    const seenJobs = new Set();
    for (const [index, job] of list(route?.narrative).entries()) {
      if (seenJobs.has(job?.job)) {
        fail('duplicate-section-job', `${at} does ${job?.job} twice. Two sections with the same job in one narrative are one section rendered twice.`);
      }

      for (const required of list(job?.requires)) {
        if (!seenJobs.has(required)) {
          fail('narrative-out-of-order', `${at}: ${job?.job} requires ${required}, which does not come before it. A narrative that depends on something later is not an order.`);
        }
      }

      seenJobs.add(job?.job);

      for (const ref of list(job?.factRefs)) {
        if (!admissible.has(ref)) {
          fail('section-outside-route-truth', `${at}: ${job?.job} binds ${ref}, which the route does not admit. A section cannot introduce truth the page was not built on.`);
        }
      }

      if (index === 0 && list(job?.requires).length) {
        fail('narrative-out-of-order', `${at}: the first section requires something to have been established before it.`);
      }
    }
  }

  return findings;
}

export function assertSitePlan(plan, options = {}) {
  const findings = validateSitePlan(plan, options);
  if (findings.length) {
    throw new Error(`Site plan is not valid:\n  ${findings.map((finding) => `${finding.code}: ${finding.detail}`).join('\n  ')}`);
  }
  return plan;
}

/* ------------------------------------------------------------------ planning */

/**
 * The families of approved truth a route can be built from.
 *
 * Facts about a business, not page types — a business either has projects or it does not, and
 * that is true before anybody decides what the site looks like. The entry question is what a
 * visitor arrives asking when this family is what they came for; it is what makes two routes
 * distinguishable, and it is the thing a page with no answer to should not be.
 */
const TRUTH_FAMILIES = [
  {
    id: 'offering',
    profileKey: 'services',
    label: 'What we do',
    path: '/services',
    entryQuestion: 'Do they do the specific thing I need, and how do they describe it?',
    establishes: 'what this business actually sells, in its own words',
  },
  {
    id: 'work',
    profileKey: 'projects',
    label: 'Work',
    path: '/work',
    entryQuestion: 'Have they done this before, for someone like me?',
    establishes: 'that the offering has been delivered, with specifics',
  },
  {
    id: 'people',
    profileKey: 'people',
    label: 'People',
    path: '/people',
    entryQuestion: 'Who would I actually be dealing with?',
    establishes: 'who does the work',
  },
  {
    id: 'proof',
    profileKey: 'testimonials',
    label: 'What clients say',
    path: '/proof',
    entryQuestion: 'Does anyone other than them say they are good?',
    establishes: 'that somebody outside the business vouches for it',
  },
  {
    id: 'coverage',
    profileKey: 'serviceAreas',
    label: 'Where we work',
    path: '/where-we-work',
    entryQuestion: 'Do they cover where I am?',
    establishes: 'the geography the business will travel to',
  },
];

/**
 * A first planner, deterministic, deriving structure from what the truth contains.
 *
 * Not the intended long-term owner of this decision. Strategy is judgement and a model role should
 * propose it; this exists because the contract has to be consumed by something before a model can
 * be trusted with it, and because a deterministic baseline is what makes the model's proposal
 * measurable against something rather than against nothing.
 *
 * It is written to be beatable. What it does *not* do is the point: it does not consult the
 * project type, it does not hold a list of pages a good site has, and it will return a one-route
 * plan without complaint when that is what the truth supports.
 */
export function planSite({ manifest, knowledgePack = null } = {}) {
  const profile = knowledgePack?.companyProfile ?? null;
  const facts = list(knowledgePack?.facts);
  const factsUnder = (prefix) => facts.filter((fact) => String(fact.path ?? '').startsWith(prefix)).map((fact) => fact.id);
  /*
   * A family's truth is its entities, each of which has an id. Falling back to fact paths would
   * give every route the same identity facts and make every route the same route — which the
   * validator caught the first time this was run, and is the reason it exists.
   */
  const entitiesUnder = (key) => list(profile?.[key]).map((entity) => entity?.id).filter(Boolean);

  const name = manifest?.project?.name ?? 'This business';
  const identity = factsUnder('identity');
  const contact = factsUnder('contact');

  const routes = [];
  const omitted = [];
  const earned = [];

  /*
   * The home route always exists, because a site has somewhere a visitor arrives. What it carries
   * is decided last, from what nothing else took.
   */
  const homeNarrative = [];
  const homeFacts = new Set(identity);

  for (const family of TRUTH_FAMILIES) {
    const refs = [...entitiesUnder(family.profileKey), ...factsUnder(family.profileKey)];
    const weight = refs.length;

    if (!weight) {
      omitted.push({
        candidate: family.label,
        because: `The approved knowledge contains nothing under ${family.profileKey}, so a page answering "${family.entryQuestion}" would have to be written rather than composed.`,
        foldedInto: null,
      });
      continue;
    }

    if (weight < ROUTE_SUFFICIENCY) {
      omitted.push({
        candidate: family.label,
        because: `Only ${weight} approved item under ${family.profileKey}. That is a section, not a page — a route built on it would be generic copy wrapped around one detail.`,
        foldedInto: '/',
      });
      for (const ref of refs) homeFacts.add(ref);
      homeNarrative.push({
        job: `${family.id}-summary`,
        binds: family.profileKey,
        // Carried in full here, because there is no other page carrying it.
        covers: 'full',
        establishes: family.establishes,
        requires: [],
        factRefs: refs,
      });
      continue;
    }

    routes.push({
      path: family.path,
      purpose: `Answer, in full, what ${name} offers under ${family.profileKey}.`,
      entryQuestion: family.entryQuestion,
      audienceId: 'prospective-client',
      existsBecause: `The approved knowledge carries ${weight} distinct items under ${family.profileKey}. Summarising them on the home page would either truncate them or make the home page the whole site; a visitor arriving with "${family.entryQuestion}" needs them in full.`,
      // Identity comes with it, because the route's opening section frames the list and a
      // section may not bind truth its route does not admit.
      factRefs: [...new Set([...refs, ...identity.slice(0, 1)])],
      exitAction: contact.length ? 'Get in touch' : null,
      narrative: [
        {
          job: `${family.id}-frame`,
          binds: 'identity',
          covers: 'preview',
          establishes: `what kind of ${family.profileKey} this business does, before the list`,
          requires: [],
          factRefs: identity.slice(0, 1),
        },
        {
          job: `${family.id}-detail`,
          binds: family.profileKey,
          covers: 'full',
          establishes: family.establishes,
          requires: [`${family.id}-frame`],
          factRefs: refs,
        },
      ],
    });
    earned.push({ family, refs });
  }

  /*
   * The home narrative. Ordered as an argument rather than as an inventory: what this is, then
   * whatever had too little truth to earn its own page, then how to make contact.
   */
  const home = {
    path: '/',
    purpose: `Say what ${name} is and route a visitor to whichever question they arrived with.`,
    entryQuestion: 'What is this business, and is it the kind of business I need?',
    audienceId: 'prospective-client',
    existsBecause: `A visitor arrives somewhere, and the approved identity facts answer "what is this" before any other page has to. ${routes.length ? `The ${routes.length} other route(s) each answer one question in full; this one decides which of them a visitor needs.` : 'It is the only route the approved truth supports in full.'}`,
    factRefs: [...homeFacts, ...contact, ...earned.flatMap(({ refs }) => refs)].length >= ROUTE_SUFFICIENCY
      ? [...new Set([...homeFacts, ...contact, ...earned.flatMap(({ refs }) => refs)])]
      : [...new Set([...homeFacts, ...contact, ...facts.slice(0, ROUTE_SUFFICIENCY).map((fact) => fact.id)])],
    exitAction: contact.length ? 'Get in touch' : null,
    narrative: [
      {
        job: 'establish-what-this-is',
        binds: 'identity',
        covers: 'full',
        establishes: 'what this business is and who it is for',
        requires: [],
        factRefs: identity,
      },
      ...homeNarrative.map((job) => ({ ...job, requires: ['establish-what-this-is'] })),
      /*
       * A preview per route that earned one. The home route's stated reason is that it decides
       * which question a visitor needs answered; without these it makes that claim and then has
       * nothing to make good on it, which is a home page with a hero and a footer.
       */
      ...earned.map(({ family, refs }) => ({
        job: `preview-${family.id}`,
        binds: family.profileKey,
        covers: 'preview',
        establishes: `that there is a ${family.label.toLowerCase()} page worth opening, and roughly what is on it`,
        requires: ['establish-what-this-is'],
        factRefs: refs,
      })),
      ...(contact.length
        ? [{
          job: 'make-contact-possible',
          binds: 'contact',
          covers: 'full',
          establishes: 'how to reach them, once there is a reason to',
          requires: ['establish-what-this-is'],
          factRefs: contact,
        }]
        : []),
    ],
  };
  routes.unshift(home);

  if (!contact.length) {
    omitted.push({
      candidate: 'Contact',
      because: 'The approved knowledge carries no contact facts. A contact page with no contact details is a page that cannot do the one thing it is for.',
      foldedInto: null,
    });
  }

  const base = {
    schemaVersion: PLAN_VERSION,
    thesis: `${name} is described from its own approved truth, and each route exists only where that truth can answer a question the other routes do not.`,
    audiences: [{ id: 'prospective-client', job: 'Decide whether this business can do the specific thing they need' }],
    routes,
    omitted,
  };
  return { ...base, planHash: hash(base) };
}
