/**
 * Mint the canonical approved-intake bundle for the MGB Decor corpus case.
 *
 * WHY THIS FILE EXISTS
 *
 * MGB Decor is the second genuine-business corpus case and the falsification
 * experiment for the Phase 4D hypothesis that one shared component vocabulary,
 * rather than NBM's thin imagery, is what limits distinctiveness. Running it
 * needs a replayable approved input, and this file is it.
 *
 * WHAT IT IS, AND WHAT IT IS NOT
 *
 * This bundle is a **prototype / product-proof** input, not a launch input. The
 * owner has supplied enough real business fact to build and judge a site; they
 * have not supplied production contact details, review evidence, project
 * histories, asset bytes or a domain. Those gaps are recorded here as gaps —
 * explicitly, in the artifact — rather than being filled with invention or used
 * as a reason not to run.
 *
 * Three kinds of statement live in this file and must never merge:
 *
 *   1. **Owner-supplied fact.** Identity, founding year, team, services,
 *      service area, positioning, insurance status, brand direction. Sourced
 *      from the owner directly.
 *   2. **Public reference location.** Facebook, Instagram and the Companies
 *      House PSC page. These are places to look, not permission to publish.
 *      Public visibility is not a republication right, and the register page is
 *      not ingested in this run, so nothing it holds is asserted here.
 *   3. **Prototype placeholder.** The phone number and email address. They are
 *      here so the quote and contact journeys can be exercised and reviewed.
 *      They are not MGB's contact details and must never be promoted to one.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED
 *
 *   - No legal incorporation date. "Founded 2020" is owner-supplied business
 *     history; SC690594 is an owner-supplied company number. Neither becomes a
 *     register fact until the Companies House source is actually ingested.
 *   - No years-of-experience number. The owner's wording is "experienced
 *     decorating team", and that is what the bundle carries.
 *   - No awards, ratings, review counts, customer counts, guarantees,
 *     accreditations, qualifications or trade memberships. None were supplied.
 *   - No approved MGB imagery. The owner granted prototype rights over a logo
 *     and two project photographs, and that rights decision is recorded — but
 *     the bytes were never handed over, so no asset is marked approved, no
 *     hash is invented and nothing claims an ingestion that did not happen.
 *   - No owned domain. `mgbdecor.com` is a stated preference. The Manifest's
 *     `siteUrl` stays unset, so no canonical link, `og:url` or `WebSite` object
 *     asserts a deployment address nobody owns.
 *   - `trust` is left unanswered, following the NBM precedent and trial finding
 *     F23: intake trust answers were once published as the company's own
 *     evidence. MGB's one genuine trust fact — that it is fully insured — has
 *     no questionnaire home, so it is preserved as intake feedback rather than
 *     smuggled into a free-text field that composition would render.
 *
 * Every gap above is recorded as intake feedback so the questionnaire can be
 * improved from real evidence rather than from a guess.
 *
 *   node examples/genuine-business/build-mgb-intake-bundle.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { mintApprovedIntakeBundle } from '../../apps/service/src/approved-intake.js';

process.chdir(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'));

const RECORDED_AT = '2026-08-30T00:00:00.000Z';

const answers = {
  project_type: 'marketing-site',
  project_name: 'MGB Decor',
  primary_goal: 'Generate qualified quote and WhatsApp enquiries while presenting MGB Decor as an established, skilled and trustworthy decorating business.',
  target_users: 'Primarily homeowners, landlords and residential customers in Glasgow and the West who need a room, a house or a rental property decorated. Also builders, developers and contractor partners commissioning new-build, refurbishment or commercial decorating, and offices, shops and other trades who need a reliable decorating team.',
  must_have: [
    'Understand what MGB Decor does',
    'See what the work looks like',
    'Understand whether MGB takes residential, commercial or contractor work',
    'Understand that MGB covers Glasgow and the West',
    'Request a quote',
    'Start a WhatsApp conversation',
  ],
  major_surfaces: ['Home', 'Services', 'Our Work', 'About', 'Contact'],
  out_of_scope: [
    'A dedicated Areas Served page; service-area information belongs on the pages that already exist',
    'A blog',
    'A public booking or calendar system, and any internal enquiry tracking',
    'Customer portal, billing, CMS, ecommerce, authentication, review integration and CRM',
    'Customer reviews or testimonials, because no owner-approved review text or provenance exists yet',
    'Named clients, named commercial customers and factual project histories, none of which were supplied',
    'Awards, ratings, review counts, customer counts, workmanship guarantees, accreditations, qualifications and trade memberships, none of which the owner has supplied',
    'Photograph upload on the quote form: the uploads capability moves a marketing site onto the application renderer, so the requirement is preserved as unmet rather than built in this run',
  ],
  existing_inputs: ['logo/brand', 'photos'],
  // The owner gave a specific visual direction and MGB is the case that tests
  // whether component vocabulary limits distinctiveness across businesses.
  // Directions are shown rather than defaulted so there is something to judge.
  design_control: 'show-design-directions',
  hard_constraints: [
    'Owner-supplied facts, prototype placeholders and public reference locations must stay distinguishable from one another',
    'The prototype phone and email values are placeholders for product testing and must never be recorded as verified MGB contact details',
    '"Founded 2020" is owner-supplied business history and must not be published as a legal incorporation date',
    'Company number SC690594 is owner-supplied; no register fact may be published until the Companies House source is ingested',
    'No invented awards, ratings, review counts, customer numbers, guarantees, accreditations, qualifications or years-of-experience claims',
    'The service area is Glasgow and the West; no mileage radius may be invented',
    'Imagery must be owner-approved MGB work or clearly labelled prototype placeholder, never stock painting photography presented as MGB work',
    'Avoid paint-splatter clichés, badge clutter, tacky emojis and black-and-gold luxury-trades styling; the logo blue is an accent and the rainbow is rare',
    'Mobile must make the quote and WhatsApp journey obvious rather than collapsing the page',
  ],
  company_identity: {
    name: 'MGB Decor',
    legalName: 'MGB Decor Ltd',
    // Owner-supplied history and identity only. The company number is recorded
    // as something the owner supplied; incorporation date and register status
    // are deliberately absent because no register source was ingested.
    description: 'Painting and decorating business founded in 2020 and run by Gary and Mick with a team of eight. MGB is Mick, Gary and Billy. Based in Glasgow, working across Glasgow and the West and travelling further for suitable work. An experienced decorating team taking on domestic, commercial, new-build and refurbishment decorating. Owner-supplied company number: SC690594.',
  },
  services: [
    'Interior painting and decorating',
    'Exterior painting and decorating',
    'Wallpapering',
    'Wallpaper removal',
    'Commercial decorating',
    'New-build decorating',
    'Property refurbishment',
    'Ames taping',
  ],
  locations: ['Glasgow', 'West of Scotland'],
  // "quote request" is the primary CTA. WhatsApp is a first-class secondary
  // route the business really uses, and the questionnaire has no option for it,
  // so it is recorded as `other` and raised as intake feedback rather than
  // dropped or silently renamed.
  conversion: ['quote request', 'call', 'email', 'contact form', 'other'],
  // `trust` is deliberately unanswered. See the header: the only genuine trust
  // fact MGB supplied is that it is fully insured, which no option expresses,
  // and inventing proof is exactly what this gate exists to prevent.
  //
  // `existing_site` is unanswered because MGB has no website; that absence is
  // the point of this case.
  contact_details: {
    // PROTOTYPE PLACEHOLDERS. Not MGB contact details. Present so the quote and
    // contact journeys can be built, exercised and reviewed.
    phone: '123456789',
    email: 'test@mgb.com',
  },
  // `cost_priority`, `expected_scale`, `seo_priority` and `content_approval`
  // stay at their questionnaire defaults and are recorded as accepted defaults.
  // The default for `seo_priority` is already `important`, which is what the
  // owner asked for, so accepting it is the honest record rather than a
  // restatement.
};

const sourceReferences = [
  {
    id: 'mgb-facebook',
    kind: 'url',
    label: 'MGB Decor Facebook page',
    uri: 'https://www.facebook.com/mgbdecor2020/?locale=en_GB',
    provenance: 'existing-site',
    purpose: 'The owner-supplied identifier for MGB’s Facebook presence. Reference only: a public profile is a place to look, not permission to republish the photographs, reviews or third-party material on it.',
    rightsStatus: 'reference-only',
    sourceRole: 'research',
    sourceChannel: 'facebook',
    publishUseAllowed: false,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'mgb-instagram',
    kind: 'url',
    label: 'MGB Decor Instagram profile',
    uri: 'https://www.instagram.com/mgbdecor2020/',
    provenance: 'existing-site',
    purpose: 'The owner-supplied identifier for MGB’s Instagram presence. Reference only, on the same rule as the Facebook page.',
    rightsStatus: 'reference-only',
    sourceRole: 'research',
    sourceChannel: 'instagram',
    publishUseAllowed: false,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'mgb-companies-house-psc',
    kind: 'url',
    label: 'Companies House persons with significant control, SC690594',
    uri: 'https://find-and-update.company-information.service.gov.uk/company/SC690594/persons-with-significant-control',
    provenance: 'external-research',
    purpose: 'Where the owner-supplied company number could be checked. Not ingested in this run, so no incorporation date, register status or officer fact is asserted anywhere in this bundle.',
    rightsStatus: 'reference-only',
    sourceRole: 'research',
    sourceChannel: 'other-public',
    publishUseAllowed: false,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'mgb-logo',
    kind: 'logo',
    label: 'MGB Decor logo',
    provenance: 'user-supplied',
    // The rights decision is real and durable. The bytes are not here, so the
    // asset is not approved, not hashed and not ingested. A rights declaration
    // is not an asset.
    purpose: 'The owner explicitly authorised prototype use of the MGB logo. The file itself was never handed over, so no bytes were ingested, no hash exists and nothing publishable was derived from it. Rights recorded; asset outstanding.',
    rightsStatus: 'approved-for-use',
    sourceRole: 'primary-brand',
    sourceChannel: 'upload',
    publishUseAllowed: false,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'mgb-project-photo-1',
    kind: 'image',
    label: 'MGB Decor project photograph 1',
    provenance: 'user-supplied',
    purpose: 'One of two project photographs the owner authorised for prototype use. No people are intentionally present and no third-party photographer restriction was supplied. The file was never handed over: rights recorded, asset outstanding, nothing ingested.',
    rightsStatus: 'approved-for-use',
    sourceRole: 'brand-supporting',
    sourceChannel: 'upload',
    publishUseAllowed: false,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'mgb-project-photo-2',
    kind: 'image',
    label: 'MGB Decor project photograph 2',
    provenance: 'user-supplied',
    purpose: 'The second owner-authorised project photograph, on the same terms as the first. Rights recorded, asset outstanding, nothing ingested.',
    rightsStatus: 'approved-for-use',
    sourceRole: 'brand-supporting',
    sourceChannel: 'upload',
    publishUseAllowed: false,
    recordedAt: RECORDED_AT,
  },
];

/**
 * What this real business needed and this questionnaire could not record.
 *
 * Principle 8: intake improves from project evidence, but the system proposes
 * versioned changes rather than rewriting its own discovery process. Each entry
 * below is a gap MGB actually hit, kept where a later questionnaire revision can
 * find it.
 */
const feedback = [
  {
    id: 'mgb-feedback-whatsapp-conversion',
    type: 'missing-requirement',
    questionId: 'conversion',
    detail: 'WhatsApp is a first-class enquiry route for this business and the second thing the owner asked the site to do. `conversion` has no option for it, so it is recorded as `other`, which loses which channel was meant. A local-service business reached through social referrals needs messaging as a named conversion.',
    nextValue: 'whatsapp',
    createdAt: RECORDED_AT,
  },
  {
    id: 'mgb-feedback-insurance-trust',
    type: 'missing-requirement',
    questionId: 'trust',
    detail: 'MGB supplied exactly one genuine trust fact — the business is fully insured — and `trust` cannot express it. The available options are testimonials, accreditations, case studies, project photos, awards and client logos, all of which would be false here. Insurance and workmanship guarantee are the two trust facts a local trade most often actually has.',
    nextValue: 'fully insured (owner-supplied, unpublished in this run for want of a questionnaire home)',
    createdAt: RECORDED_AT,
  },
  {
    id: 'mgb-feedback-placeholder-contact',
    type: 'missing-requirement',
    questionId: 'contact_details',
    detail: 'The phone and email in this bundle are prototype placeholders, and `contact_details` has no way to say so. A contact value carries no verification state, so nothing downstream can tell a placeholder from a checked business fact. This bundle keeps the distinction in prose, which is weaker than the machine-readable separation the rest of the intake contract has.',
    nextValue: '123456789 / test@mgb.com — prototype placeholders, never verified MGB contact details',
    createdAt: RECORDED_AT,
  },
  {
    id: 'mgb-feedback-social-profiles',
    type: 'missing-requirement',
    detail: 'MGB’s only web presence is Facebook and Instagram. `project-manifest.schema.json` models `company.socialProfiles` and composition already binds them as a first-class contact route — its own comment says linking to a public profile is not republishing it — but no questionnaire answer and no Manifest builder populates the field. The intake carries the URLs as reference-only sources and the built site cannot link to them.',
    createdAt: RECORDED_AT,
  },
  {
    id: 'mgb-feedback-quote-photo-upload',
    type: 'missing-requirement',
    detail: 'The owner wants customers to attach photographs to a quote request, which is the single most useful thing a decorating enquiry can carry. Enabling `uploads` moves a marketing site to the application renderer under `config/renderers.json`, turning an SEO-critical local site into a single-document application. The requirement is real, unmet, and not excluded by the owner; it is recorded here rather than dropped.',
    createdAt: RECORDED_AT,
  },
  {
    id: 'mgb-feedback-asset-bytes-outstanding',
    type: 'missing-requirement',
    detail: 'The owner approved prototype use of a logo and two project photographs. The bytes were never supplied. `source-reference.schema.json` can record the rights decision but has no way to say "rights granted, asset outstanding" — the closest available signal is withholding `assetStatus` and `publishUseAllowed`, which reads the same as "no decision made". A rights declaration without bytes must never be able to look like an ingested asset.',
    createdAt: RECORDED_AT,
  },
  {
    id: 'mgb-feedback-preferred-domain',
    type: 'missing-requirement',
    detail: 'The owner prefers `mgbdecor.com`. Nothing establishes that it is available, owned or configured, and the questionnaire has no field for a domain preference as distinct from a decided deployment address. The Manifest `siteUrl` is therefore left unset, so the build asserts no canonical URL — which is correct, but the preference itself has nowhere durable to live.',
    createdAt: RECORDED_AT,
  },
];

const bundle = mintApprovedIntakeBundle({
  projectType: 'marketing-site',
  // Thorough: a corpus case answers every question the questionnaire asks
  // rather than the quick subset, so a later rerun is measured against the
  // same surface.
  mode: 'thorough',
  answers,
  sourceReferences,
  capabilityDecisions: {},
  feedback,
  provenance: {
    producedBy: 'operator-authored',
    note: 'MGB Decor genuine-business corpus case 2, prototype/product-proof intake v1. Owner-supplied facts with clearly separated prototype placeholders and reference-only public sources. This is not a launch input: production contact details, review evidence, project histories, asset bytes and domain ownership remain outstanding and are recorded as intake feedback rather than invented.',
  },
});

// A committed baseline has to regenerate byte-for-byte, so the generated id and
// creation timestamp are pinned to the approval this file is authored against.
bundle.bundleId = 'intake-mgb-decor-prototype-v1';
bundle.createdAt = RECORDED_AT;
bundle.buildContract.approvedAt = bundle.createdAt;

const out = process.argv[2] ?? 'examples/genuine-business/mgb-approved-intake.v1.json';
fs.writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.log('wrote', out, `${fs.statSync(out).size} bytes`, `contract ${bundle.buildContractHash.slice(0, 12)}`, `manifest ${bundle.projectManifestHash.slice(0, 12)}`);
