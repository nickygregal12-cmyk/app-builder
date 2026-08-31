/**
 * Business Visual Profile.
 *
 * What sort of visual problem this build presents, derived from truth the
 * business already approved.
 *
 * Direction selection used to begin and end with the project type: a
 * marketing-site was offered the marketing-site list, directions that could not
 * render were refused, and whatever survived became the candidate set. Two
 * genuine businesses proved what that costs. nbm and MGB are both
 * `marketing-site` with no publishable photography, so both were offered the
 * same four directions, both had `immersive-lead` refused for the same reason,
 * and both received the identical remaining three. The hosted evidence shows the
 * consequence plainly: the same navigation, the same split hero, the same ruled
 * headings, the same numbered panels, the same closing ask and the same footer,
 * carrying different words. A reviewer would call that one template with
 * different copy, and they would be right.
 *
 * The renderer was not the problem — it can express materially different
 * vocabulary, and #218-#223 proved that. The problem is that nothing decided
 * which vocabulary suited *this* business.
 *
 * So this module answers one question and no others: given what the owner
 * approved, what kind of design problem is this? It is deliberately not another
 * source of truth. It invents no facts, alters no services, routes, content or
 * rights, and infers no awards or reviews. It reads structured fields that
 * already exist and reports what they imply about presentation.
 *
 * The vocabulary is design-relevant rather than industry-named. "Decorator" and
 * "quantity surveyor" would overfit a two-business corpus and would tell a
 * direction nothing it could act on; "eight services, five conversion goals, no
 * publishable photography, no trust evidence" tells it a great deal. A third
 * business should slot into these signals without a new branch.
 *
 * Every signal carries the field it came from and a sentence saying why, because
 * an opaque score is not reviewable and this feeds a decision a person is
 * entitled to disagree with.
 */

const list = (value) => (Array.isArray(value) ? value : []);

/** Above this many services, a set of items is a catalogue rather than a short list. */
const BROAD_SERVICE_COUNT = 6;

/** Above this many declared conversion goals, the page exists to be acted on. */
const HIGH_CONVERSION_GOALS = 3;

/**
 * Surfaces whose presence means the business intends to show work rather than
 * describe it. Matched on the declared surface name, which is an approved
 * manifest value rather than free prose.
 */
const SHOWCASE_SURFACES = /^(our work|work|portfolio|projects|gallery|case studies)$/i;

function signal(id, value, { field, because }) {
  return { id, value, field, because };
}

/**
 * How much of this build exists to be acted on.
 *
 * Read from declared conversion goals rather than from copy, because a goal is
 * something the owner approved and a verb in a heading is not.
 */
function conversionEmphasis(company, journeys) {
  const goals = list(company?.conversionGoals);
  const converting = journeys.filter((journey) => /request|quote|contact|call|enquir|book|start a/i.test(journey));
  const value = goals.length >= HIGH_CONVERSION_GOALS || converting.length >= 2 ? 'high' : goals.length ? 'balanced' : 'low';
  return signal('conversionEmphasis', value, {
    field: 'company.conversionGoals, project.journeys',
    because: `${goals.length} declared conversion goal(s) and ${converting.length} of ${journeys.length} journeys end in an ask.`,
  });
}

/**
 * Whether the services are a short proposition or a catalogue.
 *
 * Eight services and four are different design problems: one is a statement,
 * the other is a list somebody scans for their own job.
 */
function serviceBreadth(company) {
  const services = list(company?.services);
  return signal('serviceBreadth', services.length >= BROAD_SERVICE_COUNT ? 'broad' : 'focused', {
    field: 'company.services',
    because: `${services.length} declared service(s).`,
  });
}

/**
 * What the business can prove on the page.
 *
 * Trust signals are approved evidence — accreditations, memberships, insurance.
 * Their absence is not a flaw to be papered over; it decides whether a direction
 * can lead with credibility or has to lead with clarity.
 */
function evidenceDepth(company) {
  const signals = list(company?.trustSignals);
  return signal('evidenceDepth', signals.length ? 'evidenced' : 'unevidenced', {
    field: 'company.trustSignals',
    because: signals.length
      ? `${signals.length} approved trust signal(s) available to show.`
      : 'No approved trust signal, so nothing on the page may claim accreditation, award or review.',
  });
}

/**
 * Whether the business intends to show its work.
 *
 * Declaring the surface is the intent. Whether it currently has anything in it
 * is a different fact, and both matter: a declared-but-empty work surface is the
 * strongest possible argument against an imagery-led direction.
 */
function showcaseIntent(majorSurfaces, composition) {
  const declared = majorSurfaces.filter((surface) => SHOWCASE_SURFACES.test(String(surface).trim()));
  const empty = list(composition?.warnings).filter((warning) => warning.startsWith('empty-declared-surface:'));
  const value = !declared.length ? 'information-led' : empty.length ? 'work-led-unproven' : 'work-led';
  return signal('showcaseIntent', value, {
    field: 'project.majorSurfaces, composition.warnings',
    because: declared.length
      ? `Declares ${declared.join(', ')}${empty.length ? `, and composition reports ${empty.join(', ')}, so the intent exists and the material does not` : ''}.`
      : 'Declares no work, portfolio or gallery surface, so the page argues in words rather than pictures.',
  });
}

/**
 * How much there is to lay out.
 *
 * Counted from the frozen composition rather than guessed from the manifest, so
 * this is the density the page will actually have.
 */
function contentDensity(composition, company) {
  const sections = list(composition?.sections);
  const items = sections.reduce((total, section) => total
    + list(section.bindings).reduce((count, binding) => count + (Array.isArray(binding.value) ? binding.value.length : 0), 0), 0);
  const services = list(company?.services).length;
  const value = items >= 14 || services >= BROAD_SERVICE_COUNT ? 'compact' : items >= 7 ? 'comfortable' : 'relaxed';
  return signal('contentDensity', value, {
    field: 'composition.sections',
    because: `${sections.length} section(s) carrying ${items} bound item(s).`,
  });
}

/**
 * Whether the page is for a place or for anyone.
 *
 * A local service is chosen partly on being nearby, which is a thing the layout
 * has to make findable rather than a sentence in an About page.
 */
function serviceReach(company, journeys) {
  const locations = list(company?.locations);
  const covers = journeys.some((journey) => /cover|area|based|region|local|travel/i.test(journey));
  return signal('serviceReach', locations.length && covers ? 'local-service' : locations.length ? 'located' : 'broad', {
    field: 'company.locations, project.journeys',
    because: `${locations.length} declared location(s)${covers ? ', and a journey exists to establish coverage' : ''}.`,
  });
}

/**
 * What the direction has to carry the page with.
 *
 * Read from asset readiness rather than recomputed, because publication rights
 * are settled by source governance and this must not become a second answer.
 */
function assetMode(assetReadiness) {
  const strategy = assetReadiness?.strategy ?? 'typography-led';
  const value = strategy === 'imagery-viable' ? 'imagery-led' : strategy === 'imagery-supporting' ? 'imagery-supporting' : 'typographic';
  return signal('assetMode', value, {
    field: 'assetReadiness.strategy',
    because: assetReadiness?.strategyReason ?? 'No asset readiness was supplied, so the page is assumed to carry itself with type.',
  });
}

/**
 * Derive the profile.
 *
 * Deterministic, explainable and small. Nothing here is scored, weighted or
 * learned: each signal is a reading of one or two approved fields, and a person
 * who disagrees with a candidate set can see exactly which reading produced it.
 */
export function deriveBusinessVisualProfile({ manifest = null, composition = null, assetReadiness = null } = {}) {
  const company = manifest?.company ?? null;
  const journeys = list(manifest?.journeys).map(String);
  const majorSurfaces = list(manifest?.majorSurfaces);

  const signals = [
    conversionEmphasis(company, journeys),
    serviceBreadth(company),
    evidenceDepth(company),
    showcaseIntent(majorSurfaces, composition),
    contentDensity(composition, company),
    serviceReach(company, journeys),
    assetMode(assetReadiness),
  ];

  return {
    schemaVersion: 1,
    authority: 'derived-from-approved-intake',
    projectType: manifest?.project?.type ?? null,
    signals,
    // A flat lookup, because consumers ask "what is assetMode here?" rather than
    // wanting to walk the evidence every time.
    values: Object.fromEntries(signals.map((entry) => [entry.id, entry.value])),
  };
}

/**
 * How well a direction suits this business.
 *
 * The registry says which signal values a direction serves; this counts the
 * agreements. A direction that suits nothing scores zero and still competes,
 * because a set of three has to come from somewhere and refusing everything is
 * not a design decision.
 *
 * Ties are broken by the project-type ordering the registry already records, so
 * a business with no distinguishing signals gets exactly what it got before.
 * That is deliberate: this must change the answer for businesses that differ,
 * not churn the answer for businesses that do not.
 */
export function scoreDirectionAgainstProfile(direction, profile) {
  const suits = direction?.suits ?? {};
  const matched = [];
  for (const [signalId, accepted] of Object.entries(suits)) {
    const value = profile.values[signalId];
    if (value === undefined) continue;
    if (list(accepted).includes(value)) matched.push(`${signalId}=${value}`);
  }
  return { score: matched.length, matched };
}
