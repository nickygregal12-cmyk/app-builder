/**
 * Mint the approved-intake bundle for the Ardwell & Roe visual-ceiling benchmark.
 *
 * WHAT THIS IS
 *
 * A fictional architecture and interior-architecture studio, invented to measure
 * one thing the genuine-business corpus structurally cannot: what the factory
 * builds when the quality of the input is not the limiter.
 *
 * NBM and MGB are real, and both are thin. NBM has no photography at all; MGB
 * granted rights over three images whose bytes never arrived. Every visual
 * verdict recorded so far has therefore been measured against material a strong
 * agency would have refused to start from, and "the input was poor" has been
 * available as an explanation for every weakness. It is a fair explanation, and
 * while it stands nothing can be learned about the ceiling.
 *
 * So this input is rich on purpose: a portfolio of six projects with real
 * narrative depth, a named studio team, five testimonials, awards, statistics,
 * a stated point of view and a full asset plan. If the generated site is still
 * not excellent, the input is no longer why.
 *
 * WHY ARCHITECTURE
 *
 * The category is unforgiving in exactly the ways this benchmark measures.
 * A practice's website *is* its portfolio; the work is judged on imagery,
 * sequence, restraint and hierarchy, and there is nowhere for a weak
 * composition to hide behind sparse content. Architecture studios also publish
 * a well-understood set of surfaces — work index, project story, studio,
 * expertise, approach — so a missing capability shows up as a missing surface
 * rather than as a matter of taste.
 *
 * EVERY WORD BELOW IS INVENTED
 *
 * There is no Ardwell & Roe. There are no such projects, people, clients,
 * awards or testimonials. Four things keep that from being merely a claim in a
 * comment:
 *
 *   1. `provenance.benchmark` carries the declaration in the artifact itself,
 *      so it survives being replayed somewhere that never read this file.
 *   2. Every source is `provenance: generated`. Nothing claims to be a crawl,
 *      an upload or a register lookup.
 *   3. The domain is `.invalid`, which RFC 2606 reserves so that it can never
 *      resolve, and the telephone numbers come from the range Ofcom reserves
 *      for drama and never allocates. The site can be photographed; it cannot
 *      reach anybody.
 *   4. `tooling/visual-excellence-corpus.test.mjs` fails if any of the above
 *      stops being true.
 *
 * WHAT IS DELIBERATELY NOT SOLVED HERE
 *
 * The brief is written for the business, not for what the factory currently
 * supports. It asks for per-project surfaces the composer has no page kind for,
 * and that gap is recorded as intake feedback rather than negotiated away. A
 * benchmark that only asks for what already works cannot report a ceiling.
 *
 *   node examples/visual-excellence/build-ardwell-roe-intake-bundle.mjs
 */
import fs from 'node:fs';
import { mintApprovedIntakeBundle } from '../../apps/service/src/approved-intake.js';

// Pinned so a committed baseline regenerates byte-for-byte.
const RECORDED_AT = '2026-08-31T00:00:00.000Z';

/**
 * Contact details that cannot reach a person.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere. `0117 496 0xxx` is
 * inside the block Ofcom reserves for drama and never allocates to a
 * subscriber. Both are chosen so that the fiction is enforced by the internet
 * and the numbering plan rather than by a promise in a README — a generated
 * benchmark site can be photographed and reviewed, and it cannot be mistaken
 * for a business anybody could contact.
 */
const CONTACT = Object.freeze({
  email: 'studio@ardwellandroe.invalid',
  phone: '0117 496 0148',
  address: 'The Sail Loft, 14 Merchants Quay, Bristol, BS1 4RW',
  website: 'https://www.ardwellandroe.invalid/',
});

const answers = {
  project_type: 'marketing-site',
  project_name: 'Ardwell & Roe',

  primary_goal:
    'Win the right commissions rather than more of them: bring architecture and interior-architecture enquiries from private clients, developers and hospitality operators who have already understood how the studio works and have a project that suits it.',

  target_users:
    'Three groups who arrive for different reasons and read the site differently. Private clients commissioning a home — a refurbishment, an extension or a one-off house — who are often doing this once in their lives, are researching several practices at the same time, and need to understand what working with an architect actually involves before they can judge whether they want to. Developers and contractors with a site and a viability question, who want to see comparable completed work, delivery evidence and whether the studio can carry a project through planning and construction. Hospitality and workplace operators commissioning an interior, who care most about how a finished space feels, how it holds up in daily use, and how quickly it can open.',

  must_have: [
    'See the studio’s completed work quickly, and judge it on the photography',
    'Read one project in depth — the brief, the constraint, the response and the outcome',
    'Understand what kind of work the studio takes and what it does not',
    'Understand how the studio works, stage by stage, before making contact',
    'Understand who the studio is and who would run their project',
    'Find evidence that the studio delivers what it says it will',
    'Start a conversation about a specific project',
  ],

  // Written for the business. `Project story` has no page kind in the composer
  // today; that is recorded as feedback rather than removed from the brief.
  major_surfaces: ['Home', 'Work', 'Project story', 'Studio', 'Expertise', 'Approach', 'Contact'],

  out_of_scope: [
    'A journal, news feed or blog: the studio publishes rarely and would not keep one current',
    'Client login, project portal, document exchange or drawing issue',
    'Online booking, calendars, ecommerce and payment',
    'A careers section beyond a single contact route, until there is a vacancy to publish',
    'Multilingual content: every client to date has been UK-based',
    'Named client organisations where the commission was private and the client asked not to be listed',
  ],

  existing_inputs: ['logo/brand', 'photos', 'PDFs/docs'],

  // The studio has a strong visual point of view and expects it to be met, not
  // asked about. `show-design-directions` is the honest answer: they want to
  // choose between considered options, not to art-direct the build themselves.
  design_control: 'show-design-directions',

  cost_priority: 'balanced',
  expected_scale: 'under-1000',

  hard_constraints: [
    'Photography is the product. No treatment, overlay, heavy crop or decorative filter may be applied to project imagery without it being an explicit art-direction decision',
    'Project imagery must never be cropped so that the architecture is cut at a structural line — an opening, a soffit or a sill',
    'Every published project must credit its photographer',
    'No stock photography anywhere on the site, in any role, including backgrounds and textures',
    'The studio name is set as “Ardwell & Roe” with an ampersand, never “and”, and never in upper case',
    'Accessibility: the site must be usable at 200% zoom and fully operable by keyboard, because two of the studio’s longest-standing clients are public-sector and require it',
  ],

  company_identity: {
    name: 'Ardwell & Roe',
    legalName: 'Ardwell & Roe Architects Ltd',
    description:
      'An architecture and interior-architecture studio in Bristol, founded in 2011 by Nella Ardwell and Tomas Roe. Eleven people, working across the South West and South Wales on private houses, hospitality interiors, workplaces and the reuse of buildings that were built for something else. The studio takes a small number of projects at a time and runs each one from first sketch to completion with the same pair of people. Its work is characterised by restraint, daylight, and a preference for repairing and extending what exists over replacing it.',
  },

  services: [
    'Architecture — new build',
    'Refurbishment and extension',
    'Adaptive reuse and building conservation',
    'Interior architecture',
    'Hospitality design',
    'Workplace design',
    'Feasibility and site appraisal',
    'Planning and listed building consent',
    'Interior detailing and joinery design',
    'Furniture, fixtures and equipment specification',
  ],

  locations: ['Bristol', 'Bath', 'Somerset', 'South Wales', 'South West England'],

  conversion: ['contact form', 'email', 'call'],

  trust: ['testimonials', 'case studies', 'awards', 'project photos'],

  contact_details: CONTACT,

  seo_priority: 'important',

  content_approval: 'company contact',
};

/**
 * Sources.
 *
 * All `provenance: generated`, because all of them are. The studio's own
 * material is `approved-for-use` and publishable — that is the whole point of
 * the benchmark, and it is the axis on which this corpus differs from both
 * genuine-business cases. The asset entries below declare the *rights*; the
 * bytes are a separate, later step, and `ardwell-roe-asset-plan.v1.json` is
 * what says whether they have arrived.
 */
const sourceReferences = [
  {
    id: 'ardwell-roe-studio-brief',
    kind: 'document',
    label: 'Ardwell & Roe studio brief and positioning document',
    name: 'ardwell-roe-studio-brief.md',
    provenance: 'generated',
    purpose:
      'The invented discovery document this benchmark is built from: positioning, audience, tone of voice, values, point of view, services, process and conversion intent. It is the equivalent of what a strong agency would hold after a discovery workshop, and it exists so the factory is tested on turning good material into strong messaging rather than on writing a company from nothing.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'content',
    sourceChannel: 'upload',
    instructionAuthority: 'none',
    publishUseAllowed: true,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-project-dossier',
    kind: 'document',
    label: 'Ardwell & Roe project dossier — six completed projects',
    name: 'ardwell-roe-project-dossier.md',
    provenance: 'generated',
    purpose:
      'Six invented completed projects with brief, context, constraint, response, materials, outcome and facts. Rich enough that a premium case study is a composition problem rather than a content problem.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'content',
    sourceChannel: 'upload',
    instructionAuthority: 'none',
    publishUseAllowed: true,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-studio-people',
    kind: 'document',
    label: 'Ardwell & Roe studio team and culture notes',
    name: 'ardwell-roe-studio-people.md',
    provenance: 'generated',
    purpose: 'Five invented studio members with role, background and expertise, plus how the studio staffs a project.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'content',
    sourceChannel: 'upload',
    instructionAuthority: 'none',
    publishUseAllowed: true,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-proof',
    kind: 'document',
    label: 'Ardwell & Roe trust evidence — testimonials, awards, statistics, press',
    name: 'ardwell-roe-proof.md',
    provenance: 'generated',
    purpose:
      'Invented client testimonials, awards, practice statistics and press mentions. Every item is fictional and may never be reused outside this benchmark corpus or read as a claim about a real practice.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'content',
    sourceChannel: 'upload',
    instructionAuthority: 'none',
    publishUseAllowed: true,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-wordmark',
    kind: 'logo',
    label: 'Ardwell & Roe wordmark',
    provenance: 'generated',
    purpose:
      'The studio wordmark. Rights are granted for benchmark publication; the bytes are produced separately by whichever governed image source the owner authorises, against the brief in ardwell-roe-asset-recipes.v1.md. Until they exist this is a right without a file, and the asset plan is what says so.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'primary-brand',
    sourceChannel: 'upload',
    instructionAuthority: 'none',
    publishUseAllowed: true,
    recordedAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-photography',
    kind: 'image',
    label: 'Ardwell & Roe project and studio photography set',
    provenance: 'generated',
    purpose:
      'The photographic set the benchmark exists to test: project hero and supporting frames, material details, and studio portraits. Fully cleared for benchmark publication. The bytes are generated separately against the recipes; the asset plan tracks which have arrived.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'content',
    sourceChannel: 'upload',
    instructionAuthority: 'none',
    publishUseAllowed: true,
    recordedAt: RECORDED_AT,
  },
];

/**
 * What this brief asks for that the factory cannot yet do.
 *
 * Recorded rather than negotiated away. A benchmark written around current
 * capability measures current capability; this one is meant to find the edge of
 * it, and each entry below is a candidate finding for the completeness track.
 */
const feedback = [
  {
    id: 'ardwell-roe-feedback-project-surface',
    type: 'missing-requirement',
    questionId: 'major_surfaces',
    detail:
      'The brief asks for a story surface per project — the single most important page type an architecture practice has, and the one a commission is actually won on. Composition has `item-grid` and `gallery` for a set of projects, and no page kind for one project told at length. `major_surfaces` accepts the label, so the surface is declared and will compose as an ordinary page with nothing project-specific in it. This is the benchmark’s first structural finding and it is deliberate.',
    nextValue: 'A per-entity page kind, so one project can carry its own narrative, facts and image sequence',
    createdAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-feedback-photographer-credit',
    type: 'missing-requirement',
    detail:
      'Every published project must credit its photographer — a hard constraint here and a standard obligation in this category. An asset carries `alt`, provenance and rights, and has nowhere to record who took the photograph, so the credit cannot be rendered beside the image and the constraint cannot be met by the build.',
    nextValue: 'An attribution field on a published asset',
    createdAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-feedback-project-facts',
    type: 'missing-requirement',
    detail:
      'Each project carries structured facts a reader of this category expects — completion year, floor area, location, client type, status, photographer, awards. `companyProfile.projects` models a name and a description, so the facts either collapse into prose or are dropped. A projects grid that cannot say when something was finished is not a portfolio.',
    nextValue: 'Typed project facts on a project entity',
    createdAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-feedback-asset-role-intent',
    type: 'missing-requirement',
    detail:
      'The asset plan states each image’s intended role — hero, project-primary, project-supporting, detail, portrait, brand, social — and its crop tolerance, because a detail frame cropped as a hero is a ruined photograph. `knowledge-pack.schema.json` records variants by crop role after ingestion, and nothing carries the *intent* the asset was made for. Until it does, the plan is benchmark-side metadata that the composer cannot read.',
    nextValue: 'Declared asset role and crop tolerance, readable by composition',
    createdAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-feedback-surface-vocabulary',
    type: 'missing-requirement',
    questionId: 'major_surfaces',
    detail:
      'Composition routes a surface to its sections by matching the surface *name* against fixed patterns — `/about|team|people/`, `/service|product|offering/`. This studio calls those pages Studio, Expertise and Approach, which is ordinary vocabulary in its category and matches none of them, so all three compose empty and are reported as `empty-declared-surface`. The operator is being asked to name their pages the way the regular expression expects. A surface should declare what it is *for* rather than be recognised by its label.',
    nextValue: 'A declared surface purpose, so Studio can mean “about the practice and its people” without being called About',
    createdAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-feedback-asset-channel-coverage',
    type: 'missing-requirement',
    detail:
      'Candidate truth readiness decides whether an approved asset was ingested by asking whether *any* content arrived on the same `sourceChannel`. Here four documents and two asset sources all arrive on `upload`, so ingesting the documents marks the wordmark and the photography set as `asset-ingested` when neither has a single byte. The asset plan and its readiness gate are what actually report the gap, so nothing operational depends on the wrong answer — but the per-channel heuristic is too coarse for a case whose documents and images share a channel, which no earlier case did.',
    nextValue: 'Per-source ingestion coverage rather than per-channel',
    createdAt: RECORDED_AT,
  },
  {
    id: 'ardwell-roe-feedback-services-taxonomy',
    type: 'missing-requirement',
    detail:
      'Ten services that are really three groups — architecture, interiors, and the consenting and technical work that supports both. `company.services` is a flat list of strings, so the site will present ten equal items where the studio presents three related bodies of work. The flatness is a composition problem the panel grammar cannot solve, because the grouping does not survive intake.',
    nextValue: 'Grouped or categorised services',
    createdAt: RECORDED_AT,
  },
];

const bundle = mintApprovedIntakeBundle({
  projectType: 'marketing-site',
  mode: 'thorough',
  answers,
  sourceReferences,
  capabilityDecisions: {},
  feedback,
  provenance: {
    producedBy: 'operator-authored',
    note:
      'Ardwell & Roe is a fictional architecture studio invented as the flagship visual-excellence benchmark. Its purpose is to remove input quality as a confound: every genuine-business verdict so far has been measured against thin material, and while that stands nothing can be learned about the factory’s ceiling. Every fact, project, person, testimonial and award here is invented and may never be published as a company’s website or reused as evidence about a real practice.',
    benchmark: {
      businessReality: 'fictional',
      truthPurpose: 'visual-excellence-benchmark',
      publicationAllowed: 'benchmark-only',
      externalVerification: 'not-applicable',
      corpus: 'visual-excellence',
    },
  },
});

bundle.bundleId = 'intake-ardwell-roe-visual-ceiling-v1';
bundle.createdAt = RECORDED_AT;
bundle.buildContract.approvedAt = bundle.createdAt;

const out = process.argv[2] ?? 'examples/visual-excellence/ardwell-roe-approved-intake.v1.json';
fs.writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.log('wrote', out, `${fs.statSync(out).size} bytes`, `contract ${bundle.buildContractHash.slice(0, 12)}`, `manifest ${bundle.projectManifestHash.slice(0, 12)}`);
