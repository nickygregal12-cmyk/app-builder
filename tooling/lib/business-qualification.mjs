/**
 * Whether a business is ready to be a trial, asked before the trial rather
 * than discovered halfway through it.
 *
 * `docs/GENUINE_BUSINESS_ACCEPTANCE.md` says what a *passing run* needs, and
 * says it well. What it does not do is answer the question that comes first:
 * given this business and what has been supplied for it, is there a run here at
 * all — and if there is, does it end at a reviewable prototype or at a published
 * website?
 *
 * That gap has already cost something. `config/factory-status.json` records MGB
 * Decor as generated and reviewed, with launch outstanding on "production
 * contact details, approved review evidence, asset bytes, project histories and
 * domain ownership". Every one of those was knowable from the approved intake
 * before a line was generated. Running into them at the end is how a trial
 * becomes a prototype nobody planned for.
 *
 * ## Two tiers, because a business can be ready for one and not the other
 *
 * A **proof run** asks whether the factory can carry this business through
 * intake, composition, generation and review, and produce something a person
 * can judge. It needs facts and material. It does not need permission to
 * publish, because nothing is published.
 *
 * A **launch** asks whether the result may go in front of the public. It needs
 * everything the proof run needed, plus the things only an owner can supply: a
 * real contact destination, rights to the assets, and authority to publish.
 *
 * Collapsing the two is what produces a "failed" trial that actually succeeded
 * at the thing it could do.
 *
 * ## Three kinds of gap, and only one of them is engineering
 *
 * - `optional-content` — the result is thinner without it and is still a
 *   result. Never blocks anything.
 * - `required-content` — a fact or file the run cannot proceed honestly
 *   without. Somebody has to supply it; that somebody is usually the owner.
 * - `owner-authority` — a decision nobody can derive from material at all.
 *   Rights, publication, a domain. No amount of engineering closes one.
 *
 * The distinction is the point. A checklist that reports twelve blockers of
 * unknown kind gets read as "not ready"; one that reports two facts to collect
 * and one decision to make gets acted on.
 *
 * ## Suspected placeholders are questions, never refusals
 *
 * `test@mgb.com` and `123456789` are in a committed approved-intake bundle in
 * this repository, and its own provenance note says it carries prototype
 * placeholders. Catching those is most of the value here.
 *
 * But a real business may have a phone number that looks odd, and a checker
 * that refused it would be wrong in the expensive direction — telling somebody
 * their genuine details are fake. So a suspected placeholder is reported as
 * something to confirm, classified as owner authority, and the rule that fired
 * is always named so a person can disagree with it in one sentence.
 */

/** Local parts that are nobody's real address. */
const PLACEHOLDER_LOCALS = new Set(['test', 'tests', 'example', 'demo', 'sample', 'foo', 'bar', 'user', 'email', 'noreply', 'no-reply', 'donotreply', 'changeme', 'youremail']);

/** Domains reserved, unroutable, or conventionally fake. */
const PLACEHOLDER_DOMAINS = [/(^|\.)example\.(com|org|net)$/i, /\.example$/i, /\.invalid$/i, /\.test$/i, /\.local$/i, /^localhost$/i];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Does this email look like nobody's?
 *
 * Returns the rule that fired rather than a boolean, because the caller has to
 * print it. "Suspected placeholder" with no reason is an accusation.
 */
export function suspectEmail(value) {
  const email = text(value).toLowerCase();
  if (!email) return null;
  const [local, domain = ''] = email.split('@');
  if (PLACEHOLDER_LOCALS.has(local)) return `the local part is "${local}"`;
  if (PLACEHOLDER_DOMAINS.some((pattern) => pattern.test(domain))) return `"${domain}" is a reserved or non-routable domain`;
  return null;
}

/**
 * Does this phone number look typed rather than dialled?
 *
 * Only the unmistakable cases: a run of identical digits, a straight ascending
 * or descending sequence, or a number too short to reach anybody. Real numbers
 * are punctuated, grouped and irregular, and none of those is treated as
 * suspicious.
 */
export function suspectPhone(value) {
  const raw = text(value);
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 7) return `only ${digits.length} digits, which cannot reach anybody`;
  if (/^(\d)\1+$/.test(digits)) return `every digit is "${digits[0]}"`;
  const ascending = [...digits].every((digit, index, all) => index === 0 || Number(digit) === Number(all[index - 1]) + 1);
  const descending = [...digits].every((digit, index, all) => index === 0 || Number(digit) === Number(all[index - 1]) - 1);
  if (ascending || descending) return 'the digits run in sequence';
  return null;
}

/** One finding. `kind` decides who has to act, and whether anything is blocked. */
function gap(kind, subject, detail, tiers) {
  return { kind, subject, detail, blocks: tiers };
}

/**
 * Qualify a business from its approved intake bundle.
 *
 * Reads only what the bundle states. Anything it cannot establish is reported
 * as unestablished rather than assumed either way — a checklist that guessed
 * would be worse than none, because it would be believed.
 *
 * @param {object} bundle an approved-intake bundle
 * @param {object} [declared] things no bundle can carry, if somebody has recorded
 *        them elsewhere: { publicationAuthority, assetRights, domainOwnership,
 *        legalOrTruthBlockers }
 */
export function qualifyBusiness(bundle, declared = {}) {
  const manifest = bundle?.projectManifest ?? null;
  const company = manifest?.company ?? {};
  const identity = company.identity ?? {};
  const contact = company.contactDetails ?? {};
  const inputs = manifest?.inputs ?? {};
  const gaps = [];

  if (!manifest) {
    return {
      schemaVersion: 1,
      authority: 'business-qualification',
      bundleId: bundle?.bundleId ?? null,
      business: null,
      tiers: { proofRun: { qualified: false }, launch: { qualified: false } },
      gaps: [gap('required-content', 'project manifest', 'The bundle carries no project manifest, so there is nothing to qualify.', ['proof-run', 'launch'])],
    };
  }

  // --- Identity -------------------------------------------------------------------
  if (!text(identity.name)) gaps.push(gap('required-content', 'business name', 'No trading name. Nothing can be written about a business that has not been named.', ['proof-run', 'launch']));
  if (!text(identity.description)) gaps.push(gap('required-content', 'what the business does', 'No description. Without one the factory would be inventing the business rather than presenting it.', ['proof-run', 'launch']));
  if (!text(identity.legalName)) gaps.push(gap('optional-content', 'legal name', 'No registered name. A site can be built without one; a footer that states company details cannot.', []));

  // --- What it sells and to whom ---------------------------------------------------
  const services = list(company.services);
  if (!services.length) gaps.push(gap('required-content', 'services', 'No services. A marketing site whose services are inferred is a site making claims nobody supplied.', ['proof-run', 'launch']));
  // `summary` is the field `schemas/project-manifest.schema.json` requires, and
  // it is read as the contract rather than as one of several names that might
  // work. An earlier draft of this checker read `targetUsers` — a field that
  // exists in the generated acceptance fixtures and not in the schema — and
  // reported the accepted nbm run as unqualified. A checklist that is wrong
  // about a case somebody has already passed will be ignored on the case it is
  // right about.
  if (!text(manifest.audience?.summary)) gaps.push(gap('required-content', 'audience', 'No stated audience, so there is nothing to judge whether the result speaks to the right person.', ['proof-run', 'launch']));

  const goals = list(company.conversionGoals);
  if (!goals.length) gaps.push(gap('required-content', 'conversion goals', 'No conversion goal, so the site has no stated purpose and its enquiry flow cannot be judged against anything.', ['proof-run', 'launch']));

  // --- Enough material to build three purposeful routes ------------------------------
  //
  // Three because a one-page site does not exercise navigation, hierarchy or
  // information architecture, and those are most of what a review is for. It is
  // a floor on what the trial can measure rather than a rule about websites.
  const routeMaterial = services.length + list(company.locations).length + list(company.trustSignals).length;
  if (services.length < 3 && routeMaterial < 3) {
    gaps.push(gap('required-content', 'material for three purposeful routes', `Only ${routeMaterial} substantive content group(s). A trial that produces one page does not exercise navigation or hierarchy, which is most of what its review is for.`, ['proof-run', 'launch']));
  }

  // --- Sources ----------------------------------------------------------------------
  const sources = list(inputs.sources);
  if (!sources.length) {
    gaps.push(gap('required-content', 'governed source material', 'No source is declared, so every fact in the result would be unprovenanced. Principle 7 is not satisfiable without one.', ['proof-run', 'launch']));
  }
  if (!text(inputs.existingWebsite) && !sources.some((source) => source.kind === 'url')) {
    gaps.push(gap('optional-content', 'existing public web presence', 'Nothing public to read the business from. Not required — a business without a website is a common reason to want one — but the trial then rests entirely on owner-supplied material.', []));
  }

  // --- Contact destination -----------------------------------------------------------
  //
  // A proof run can be judged with a placeholder in the contact block. A launch
  // cannot: an enquiry that reaches nobody is worse than no enquiry form.
  const phone = text(contact.phone);
  const email = text(contact.email);
  const address = text(contact.address);
  if (!phone && !email && !address) {
    gaps.push(gap('required-content', 'contact destination', 'No phone, email or address. A conversion goal with nowhere to convert to cannot be reviewed or published.', ['proof-run', 'launch']));
  }
  const suspects = [
    email && suspectEmail(email) ? { field: 'email', value: email, why: suspectEmail(email) } : null,
    phone && suspectPhone(phone) ? { field: 'phone', value: phone, why: suspectPhone(phone) } : null,
  ].filter(Boolean);
  for (const suspect of suspects) {
    gaps.push(gap(
      'owner-authority',
      `production ${suspect.field}`,
      `"${suspect.value}" looks like a placeholder — ${suspect.why}. Confirm it is real or replace it before anything is published. A proof run can proceed with it; an enquiry that reaches nobody cannot be launched.`,
      ['launch'],
    ));
  }
  if (!address) gaps.push(gap('optional-content', 'address', 'No address. A local business usually wants one; a national one may not.', []));

  // --- Proof the business has done the work -------------------------------------------
  if (!list(company.trustSignals).length) {
    gaps.push(gap('optional-content', 'proof and trust signals', 'No accreditations, reviews or project histories. The result will read as capable and unproven, which a reviewer should be told to expect rather than mark down as a factory defect.', []));
  }

  // --- Things no bundle can carry -------------------------------------------------------
  //
  // Reported as unestablished rather than missing. The bundle is silent on them
  // by design: they are decisions, and a decision recorded in a content file
  // would not be one.
  const authorities = [
    ['publicationAuthority', 'authority to publish', 'Nobody has recorded that this business has agreed to a public website being launched on its behalf.'],
    ['assetRights', 'asset rights', 'Reuse rights for the supplied logo, photographs and documents are not recorded as approved.'],
    ['domainOwnership', 'domain ownership', 'No domain is recorded as owned and available to point at a release.'],
  ];
  for (const [key, subject, detail] of authorities) {
    if (declared[key] !== true) gaps.push(gap('owner-authority', subject, detail, ['launch']));
  }
  for (const blocker of list(declared.legalOrTruthBlockers)) {
    gaps.push(gap('owner-authority', 'unresolved legal or truth blocker', String(blocker), ['proof-run', 'launch']));
  }

  const blocking = (tier) => gaps.filter((entry) => entry.blocks.includes(tier));

  return {
    schemaVersion: 1,
    authority: 'business-qualification',
    bundleId: bundle?.bundleId ?? null,
    business: text(identity.name) || null,

    tiers: {
      /** Can the factory carry this through to something a person can judge? */
      proofRun: { qualified: blocking('proof-run').length === 0, blockedBy: blocking('proof-run').map((entry) => entry.subject) },
      /** May the result go in front of the public? */
      launch: { qualified: blocking('launch').length === 0, blockedBy: blocking('launch').map((entry) => entry.subject) },
    },

    gaps,
    counts: {
      optionalContent: gaps.filter((entry) => entry.kind === 'optional-content').length,
      requiredContent: gaps.filter((entry) => entry.kind === 'required-content').length,
      ownerAuthority: gaps.filter((entry) => entry.kind === 'owner-authority').length,
    },

    // Said in the artifact, because a qualification is the sort of thing that
    // gets quoted later without its caveats.
    doesNotEstablish: [
      'That the supplied facts are true. Provenance is checked elsewhere and this reads what the bundle states, not whether the business states it.',
      'That the result will be any good. Qualification is about whether a trial can honestly start, never about how it will end.',
    ],
  };
}
