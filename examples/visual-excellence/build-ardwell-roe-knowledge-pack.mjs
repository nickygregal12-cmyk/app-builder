/**
 * Materialise the frozen knowledge pack for the Ardwell & Roe benchmark.
 *
 * NBM's pack is built by crawling the practice's real website. There is nothing
 * to crawl here, and inventing a crawl would be a lie about where the material
 * came from — so this pack is constructed directly and every record in it says
 * `provenance: generated`. That is not a weaker pack; it is an honestly
 * labelled one, and it is the only correct shape for invented truth.
 *
 * WHAT MAKES THIS THE INTERESTING INPUT
 *
 * Six projects with a brief, a constraint, a response, materials, an outcome
 * and structured facts. Five studio members. Five testimonials, four awards,
 * practice statistics and press. Ten services across three bodies of work. This
 * is roughly what a strong agency would hold after discovery, and it is
 * deliberately more than either genuine-business case could supply.
 *
 * The point is not that the factory should copy it. The point is that after
 * this, "the input was thin" stops being available as an explanation for a
 * weak result. Whatever the generated site does badly from here is the
 * factory's own ceiling.
 *
 * ASSETS ARE DELIBERATELY ABSENT
 *
 * `assets` is empty and stays empty until real bytes are ingested against the
 * IDs in `ardwell-roe-asset-plan.v1.json`. An asset with no file is a right,
 * not an asset, and `knowledge-pack.schema.json` requires a `contentHash` — so
 * there is no way to record one here that would not be an invented hash for a
 * file that does not exist. The asset-readiness gate is what reports the gap.
 *
 *   node examples/visual-excellence/build-ardwell-roe-knowledge-pack.mjs [--verify]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertKnowledgePack } from '@app-builder/content-intelligence';
import { composeProject } from '@app-builder/composition';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(here, 'ardwell-roe-approved-intake.v1.json');
const OUT = path.join(here, 'ardwell-roe-approved-knowledge.v1.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const BRIEF = 'ardwell-roe-studio-brief';
const DOSSIER = 'ardwell-roe-project-dossier';
const PEOPLE = 'ardwell-roe-studio-people';
const PROOF = 'ardwell-roe-proof';

let factSeq = 0;
const facts = [];

/** A fact, and the pointer a company profile uses to cite it. */
function fact(path_, value, sourceId) {
  factSeq += 1;
  const id = `fact-ar-${String(factSeq).padStart(3, '0')}`;
  facts.push({
    id,
    path: path_,
    value,
    sourceId,
    provenance: 'generated',
    confidence: 1,
    // `user-provided` is the honest verification state for benchmark truth: it
    // is authoritative for this run because the operator authored it, and it is
    // not `verified`, because nothing external could have checked it.
    verification: 'user-provided',
    evidence: [{ sourceId, excerpt: typeof value === 'string' ? value.slice(0, 180) : String(value) }],
  });
  return { value, factId: id, verification: 'user-provided', confidence: 1 };
}

function entity(sourceId, fields) {
  return { id: `ent-ar-${sha256(JSON.stringify(fields)).slice(0, 12)}`, sourceId, provenance: 'generated', verification: 'user-provided', ...fields };
}

const identity = {
  name: fact('identity.name', 'Ardwell & Roe', BRIEF),
  legalName: fact('identity.legalName', 'Ardwell & Roe Architects Ltd', BRIEF),
  description: fact(
    'identity.description',
    'An architecture and interior-architecture studio in Bristol, founded in 2011 by Nella Ardwell and Tomas Roe. Eleven people working across the South West and South Wales on private houses, hospitality interiors, workplaces and the reuse of buildings built for something else. The studio takes a small number of projects at a time and runs each from first sketch to completion with the same pair of people, and prefers repairing and extending what exists to replacing it.',
    BRIEF,
  ),
};

const contact = {
  email: fact('contact.email', 'studio@ardwellandroe.invalid', BRIEF),
  phone: fact('contact.phone', '0117 496 0148', BRIEF),
  address: fact('contact.address', 'The Sail Loft, 14 Merchants Quay, Bristol, BS1 4RW', BRIEF),
  website: fact('contact.website', 'https://www.ardwellandroe.invalid/', BRIEF),
};

const SERVICE_LINES = [
  ['Architecture — new build', 'Houses and small public buildings designed from the ground up, usually on difficult or constrained sites where the constraint is the reason the project is interesting.', 'Architecture'],
  ['Refurbishment and extension', 'Work to existing houses, from a single well-made room to a whole-house reordering. The studio’s largest body of work and where most private clients start.', 'Architecture'],
  ['Adaptive reuse and building conservation', 'Giving a building that has outlived its first purpose a second one, including listed and locally listed structures. Repair before replacement, always.', 'Architecture'],
  ['Interior architecture', 'The inside of a building treated as architecture rather than decoration: light, volume, circulation, threshold and the way a plan is actually used.', 'Interiors'],
  ['Hospitality design', 'Restaurants, bars and small hotels, designed for the way a room performs on a full Saturday as well as an empty Tuesday.', 'Interiors'],
  ['Workplace design', 'Studios and offices for organisations that want somewhere specific rather than somewhere neutral.', 'Interiors'],
  ['Feasibility and site appraisal', 'A short, costed piece of work that answers whether a site or building can do what a client hopes, before anybody commits to a scheme.', 'Technical and consenting'],
  ['Planning and listed building consent', 'Preparing, submitting and negotiating applications, including in conservation areas and on listed buildings.', 'Technical and consenting'],
  ['Interior detailing and joinery design', 'Drawing the parts a building is actually made of, and working directly with the makers who build them.', 'Technical and consenting'],
  ['Furniture, fixtures and equipment specification', 'Selecting and specifying everything loose, so a finished room is finished rather than nearly finished.', 'Technical and consenting'],
];

const PROJECT_RECORDS = [
  {
    name: 'Cargo House',
    location: 'Totterdown, Bristol',
    category: 'Refurbishment and extension',
    completed: '2024',
    floorArea: '178 m²',
    client: 'Private',
    photographer: 'Ines Halloran',
    description:
      'A Victorian terrace on one of the steepest streets in Bristol, reordered around the view it had always turned its back on. The rear wall was opened and rebuilt as a deep timber-framed bay that steps down with the hill, so the kitchen sits half a level below the garden and looks out across the city rather than into the neighbouring wall.',
    challenge:
      'The house was three tight rooms deep with a single north window at the back, and every previous attempt on the street had answered that with a full-width glass box that cooked in summer and lost the garden.',
    response:
      'Rather than widen, the studio went deeper and lower, and traded glass area for a shaded reveal. The bay is oak-framed and set back under a 900mm soffit, so the glazing is smaller than the neighbours’ and the room is brighter for longer.',
    materials: 'Douglas fir frame, lime-plastered walls, reclaimed pennant stone threshold, unlacquered brass ironmongery.',
    outcome: 'Measured internal daylight rose in a room with less glazing than the scheme it replaced. The house has since been used as a reference project by the studio’s structural engineer.',
  },
  {
    name: 'Ashcombe Barn',
    location: 'Mendip Hills, Somerset',
    category: 'Adaptive reuse',
    completed: '2023',
    floorArea: '240 m²',
    client: 'Private',
    photographer: 'Ines Halloran',
    description:
      'A collapsing stone threshing barn turned into a single-storey house without adding a second floor, on the principle that the volume was the thing worth keeping. New accommodation sits as a row of insulated timber boxes inside the stone shell, leaving the roof structure and the full height of the barn readable from end to end.',
    challenge: 'A Grade II listing, a structurally unsound gable, and a planning history of two refused applications that had both proposed inserting a first floor.',
    response: 'The inserted rooms are freestanding and reversible, touching the stone at as few points as possible. Nothing is fixed into the historic fabric that could not be removed.',
    materials: 'Existing rubble stone repaired in lime, cross-laminated timber inserts, sheep’s wool insulation, cast-iron rooflights salvaged from the original cart bay.',
    outcome: 'Consented at first submission after the two previous refusals. Now the studio’s most-requested project at first enquiry.',
  },
  {
    name: 'The Bottle Works',
    location: 'Bedminster, Bristol',
    category: 'Hospitality',
    completed: '2025',
    floorArea: '410 m²',
    client: 'Fen & Marrow',
    photographer: 'Ines Halloran',
    description:
      'A former glass bottling hall turned into a 90-cover restaurant and bar. The kitchen was placed against the long wall in full view, so the room’s organising idea is the work rather than a feature bar, and seating steps back from it in three bands of decreasing formality.',
    challenge: 'A 34-metre-long room with windows at one end only, and an operator who needed it to work at 30 covers on a Tuesday without feeling abandoned.',
    response: 'The room is divided by joinery rather than by walls, so it can be closed down band by band across a week. Lighting is circuited to match, and the empty end reads as intentional rather than unused.',
    materials: 'Salvaged maple flooring, blackened steel screens, tiled service counter, plaster ceiling left unlined to keep the volume.',
    outcome: 'Opened three weeks ahead of programme. The operator has since taken a second site with the same studio.',
  },
  {
    name: 'Quarry Lane',
    location: 'Chew Valley, Somerset',
    category: 'New build',
    completed: '2024',
    floorArea: '196 m²',
    client: 'Private',
    photographer: 'Devan Oyelaran',
    description:
      'A new house on the footprint of a demolished agricultural building, arranged as two linked volumes that follow the fall of the site. The larger holds living space and opens west; the smaller holds bedrooms and turns away from the road.',
    challenge: 'An open countryside site where consent depended entirely on the replacement-dwelling footprint, and where the previous owner had already been refused twice for exceeding it.',
    response: 'The scheme is exactly the footprint it replaced, and buys its space by section rather than plan: the living volume is a metre and a half taller than a domestic room needs to be, and the bedroom volume is deliberately low.',
    materials: 'Charred larch cladding, board-marked concrete plinth, clay pantile roof matching the demolished barn.',
    outcome: 'Consented in eight weeks. Airtightness tested at 1.9 m³/h·m² without a specialist contractor.',
  },
  {
    name: 'Tidewell Studio',
    location: 'Cardiff Bay',
    category: 'Workplace',
    completed: '2023',
    floorArea: '320 m²',
    client: 'Tidewell Marine Research',
    photographer: 'Devan Oyelaran',
    description:
      'A workplace for a marine research group, half laboratory and half writing room, in a first-floor dockside unit with a concrete frame and no thermal mass to spare. The two halves are separated by a full-height storage wall that also does the acoustic work.',
    challenge: 'Wet laboratory servicing and quiet desk work in one shell, on a budget that could not afford to fully fit out both.',
    response: 'Everything serviced was pushed to one bay and left frankly exposed; everything quiet was left as plain, well-daylit floor. The saving from not lining the laboratory paid for the storage wall.',
    materials: 'Exposed galvanised services, birch ply casework, linoleum, acoustic felt from recycled bottle stock.',
    outcome: 'Delivered 12% under budget. Reverberation in the writing room measured at 0.6 seconds against a 0.8 target.',
  },
  {
    name: 'Pilgrim Street Rooms',
    location: 'Bath',
    category: 'Compact intervention',
    completed: '2022',
    floorArea: '46 m²',
    client: 'Private',
    photographer: 'Ines Halloran',
    description:
      'A one-bedroom flat in a Grade II* terrace, reorganised without moving a single wall. Every change is joinery: a bed that closes into a panelled wall, a kitchen behind full-height doors, and a bathroom lined as a single cabinet.',
    challenge: 'A protected interior where nothing structural could be touched, and a client who needed the flat to work as both a home and a consulting room.',
    response: 'The studio treated the flat as furniture. Each piece is freestanding, scribed to the existing plaster and removable without trace.',
    materials: 'Painted tulipwood joinery throughout, honed limestone to the bathroom floor and threshold, unlacquered brass ironmongery left to patinate, and undyed wool to the bed recess for acoustic separation from the stair.',
    outcome: 'Consented as a listed building application with no fabric alteration. The smallest project the studio has taken, and the one most often published.',
  },
];

const PEOPLE_RECORDS = [
  { name: 'Nella Ardwell', role: 'Founding director', description: 'Co-founded the studio in 2011 after eleven years in London working on public buildings. Leads the housing and adaptive-reuse work, and runs every project she takes from first sketch to handover. Teaches one day a fortnight at the Welsh School of Architecture.' },
  { name: 'Tomas Roe', role: 'Founding director', description: 'Co-founder, and the studio’s interiors lead. Trained as a furniture maker before qualifying as an architect, which is why the studio draws its own joinery and works directly with makers rather than through a contractor’s specification.' },
  { name: 'Priya Sandhar', role: 'Associate architect', description: 'Joined in 2016. Leads hospitality and workplace projects and the studio’s technical delivery. The person most likely to be on site on a Friday.' },
  { name: 'Callum Frayne', role: 'Architect', description: 'Conservation-accredited. Runs the listed and locally listed work, and prepares the studio’s heritage statements in-house rather than commissioning them.' },
  { name: 'Marit Eklund', role: 'Interior architect', description: 'Leads material research and specification, and maintains the studio’s material library — which clients are welcome to visit and frequently do before appointing.' },
];

const TESTIMONIAL_RECORDS = [
  { quote: 'We interviewed four practices and Ardwell & Roe were the only ones who told us the thing we wanted was the wrong thing to want. They were right, and the house is better for it.', attribution: 'Private client, Cargo House' },
  { quote: 'Two refusals in four years, then consented first time. They spent longer understanding why the building was listed than the other architects spent on the whole application.', attribution: 'Private client, Ashcombe Barn' },
  { quote: 'They designed the room around how a service actually runs, not around how it photographs. Three weeks early and we have taken a second site with them.', attribution: 'Operations director, Fen & Marrow' },
  { quote: 'The budget was tight and they were honest about it from the first meeting. What we could not afford, they left plainly unfinished rather than cheaply finished, and it looks deliberate because it is.', attribution: 'Director, Tidewell Marine Research' },
  { quote: 'Forty-six square metres and they never once suggested we move. It is the only flat I have lived in where nothing is in the way.', attribution: 'Private client, Pilgrim Street Rooms' },
];

const AWARD_RECORDS = [
  { name: 'RIBA South West Award — Ashcombe Barn', year: '2024' },
  { name: 'Civic Trust Commendation — The Bottle Works', year: '2025' },
  { name: 'Wood Awards, Small Project shortlist — Pilgrim Street Rooms', year: '2023' },
  { name: 'Somerset Design Review Panel commendation — Quarry Lane', year: '2024' },
];

const companyProfile = {
  identity,
  contact,
  socialProfiles: [],
  serviceAreas: ['Bristol', 'Bath', 'Somerset', 'South Wales', 'South West England'].map((area) => {
    const pointer = fact('serviceArea', area, BRIEF);
    return { value: area, factId: pointer.factId, verification: 'user-provided' };
  }),
  services: SERVICE_LINES.map(([name, description, group]) => entity(BRIEF, { name, description, group })),
  people: PEOPLE_RECORDS.map((person) => entity(PEOPLE, person)),
  projects: PROJECT_RECORDS.map((project) => entity(DOSSIER, project)),
  testimonials: TESTIMONIAL_RECORDS.map((item) => entity(PROOF, item)),
  accreditations: AWARD_RECORDS.map((item) => entity(PROOF, item)),
};

// Practice statistics, recorded as facts so they are citable even though no
// current composition consumer renders them. A benchmark that only supplies
// what renders today cannot report what is missing.
fact('practice.founded', '2011', BRIEF);
fact('practice.teamSize', '11', BRIEF);
fact('practice.completedProjects', '84', PROOF);
fact('practice.repeatClientShare', '38%', PROOF);
fact('practice.pressMentions', 'Architects’ Journal, Dezeen, The Modern House, Somerset Life', PROOF);

/** Source documents, as content records, because they really were "read". */
const SOURCE_DOCUMENTS = [
  [BRIEF, 'Studio brief and positioning', `${identity.description.value}\n\nPoint of view: repair before replacement; the constraint is usually the reason the project is interesting; a small number of projects at a time, each run by the people who designed it.`],
  [DOSSIER, 'Project dossier', PROJECT_RECORDS.map((p) => `${p.name}, ${p.location} (${p.completed}). ${p.description} Challenge: ${p.challenge} Response: ${p.response} Materials: ${p.materials} Outcome: ${p.outcome}`).join('\n\n')],
  [PEOPLE, 'Studio team', PEOPLE_RECORDS.map((p) => `${p.name}, ${p.role}. ${p.description}`).join('\n\n')],
  [PROOF, 'Trust evidence', [...TESTIMONIAL_RECORDS.map((t) => `"${t.quote}" — ${t.attribution}`), ...AWARD_RECORDS.map((a) => `${a.name} (${a.year})`)].join('\n')],
];

const content = SOURCE_DOCUMENTS.map(([sourceId, title, text]) => ({
  id: `content-${sourceId}`,
  sourceId,
  kind: 'document',
  contentHash: sha256(text),
  provenance: 'generated',
  metadata: { title },
  headings: [{ level: 1, text: title }],
  text,
}));

const chunks = SOURCE_DOCUMENTS.map(([sourceId, , text]) => ({
  id: `chunk-${sourceId}`,
  contentHash: sha256(text),
  text,
  sourceIds: [sourceId],
  provenance: 'generated',
  approxTokens: Math.ceil(text.length / 4),
}));

const documentText = new Map(SOURCE_DOCUMENTS.map(([sourceId, , text]) => [sourceId, text]));
const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));

const base = {
  schemaVersion: 1,
  intelligenceVersion: '0.1.0',
  project: { name: 'Ardwell & Roe', type: 'marketing-site' },
  // Only the sources that were actually ingested. The wordmark and the
  // photography set are declared on the manifest — their rights are granted —
  // but no bytes were ever supplied, so there is no content to hash and nothing
  // to record here. Listing them would require inventing a hash for a file that
  // does not exist, which is the one thing a pack must never do. They stay
  // `asset-right-without-bytes` on the manifest until the bytes arrive.
  sources: bundle.projectManifest.inputs.sources
    .filter((source) => documentText.has(source.id))
    .map((source) => ({ ...source, contentHash: sha256(documentText.get(source.id)) })),
  facts,
  companyProfile,
  brand: {
    colors: [],
    fontFamilies: [],
    titles: ['Ardwell & Roe'],
    sourceCandidates: [],
    logoCandidates: [],
    screenshotCandidates: [],
    publishableAssetIds: [],
    referenceOnlyAssetIds: [],
    generatedBrandClaims: [],
  },
  // Empty until real bytes are ingested against the asset plan. A right is not
  // an asset, and the schema requires a contentHash that cannot be invented.
  assets: [],
  content,
  chunks,
  references: [],
  requirements: [],
  research: [],
  generatedCopy: [],
};

const pack = assertKnowledgePack({ ...base, packHash: sha256(JSON.stringify(base)) });

if (process.argv.includes('--verify')) {
  const frozen = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const withoutHash = { ...frozen };
  delete withoutHash.packHash;
  if (sha256(JSON.stringify(withoutHash)) !== frozen.packHash) {
    console.error(`Frozen pack hash does not match its contents: recorded ${frozen.packHash}.`);
    process.exit(1);
  }
  const composition = composeProject({ manifest: bundle.projectManifest, knowledgePack: frozen, assetDecisions: [] });
  console.log(`Frozen pack ${frozen.packHash} verified.`);
  console.log(`  facts ${frozen.facts.length}, projects ${frozen.companyProfile.projects.length}, people ${frozen.companyProfile.people.length}, testimonials ${frozen.companyProfile.testimonials.length}, assets ${frozen.assets.length}`);
  console.log(`  composition ${composition.compositionHash}, warnings: ${composition.warnings.join(', ') || 'none'}`);
} else {
  fs.writeFileSync(OUT, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(`  packHash ${pack.packHash}`);
  console.log(`  facts ${pack.facts.length}, services ${pack.companyProfile.services.length}, projects ${pack.companyProfile.projects.length}, people ${pack.companyProfile.people.length}, testimonials ${pack.companyProfile.testimonials.length}, awards ${pack.companyProfile.accreditations.length}, assets ${pack.assets.length}`);
}
