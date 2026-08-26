/**
 * Mint the canonical approved-intake bundle for the Phase 3.8E nbm trial.
 *
 * WHY THIS FILE EXISTS
 *
 * The intake that produced the original nbm Build Contract and Manifest was
 * never persisted. It was searched for before this file was written — every
 * branch and every commit in this repository, and the local durable service
 * state — and it is not recoverable. Issue #70 is the fix for the cause; this
 * file is the honest consequence.
 *
 * So this is NOT a byte-identical reconstruction of the lost original, and it
 * must never be described as one. It is an explicitly versioned REPLACEMENT
 * baseline, authored from durable evidence that does survive:
 *
 *   - the owner-approved workbook `nbm-genuine-business-acceptance.xlsx`
 *     (Group A verified public facts, Group B acceptance intent and rights);
 *   - `docs/GENUINE_BUSINESS_ACCEPTANCE.md`, the acceptance contract;
 *   - `docs/TRIAL_FINDINGS.md`, which records what the first trial learned.
 *
 * Every answer below traces to one of those. Where the workbook is silent, the
 * answer is left at the questionnaire default or left out, and the bundle
 * records it as an accepted default rather than as something the operator said.
 * Nothing here asserts a client, project, award, accreditation or performance
 * claim, because no approved source supports one.
 *
 * From this baseline forward, an nbm rerun replays this bundle instead of
 * asking anyone to remember questionnaire answers.
 *
 *   node examples/genuine-business/build-nbm-intake-bundle.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { mintApprovedIntakeBundle } from '../../apps/service/src/approved-intake.js';

process.chdir(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'));

const answers = {
  project_type: 'marketing-site',
  project_name: 'nbm Construction Cost Consultants',
  // Workbook B: target impression, prioritise, and the conversion intent.
  primary_goal: 'Present nbm as an established, credible construction cost consultancy and turn a qualified project enquiry into contact with the practice.',
  // Workbook A: principal activity and the two offices. Not a claim about who
  // the practice has worked for — a description of who the site is written for.
  target_users: 'Clients and professional teams commissioning construction projects in central Scotland: developers, public-sector and private clients, architects and contractors looking for quantity surveying, employer’s agent, project management or building surveying support.',
  must_have: [
    'Understand what nbm does across the project lifecycle',
    'Find the right service for a specific project need',
    'See where the practice is based and which areas it works in',
    'Contact the practice about a project',
  ],
  major_surfaces: ['Home', 'Services', 'About', 'Contact'],
  // Workbook B rights declaration, and the trial finding that named projects
  // could not be re-verified through source ingestion.
  out_of_scope: [
    'Named client or project case studies, which could not be re-verified through source ingestion',
    'Republished nbm website photographs, logo files or staff photographs',
    'Performance, client, award, accreditation or experience claims that no approved source supports',
    'Online payment, client portal or document exchange',
  ],
  existing_inputs: ['existing website', 'spreadsheets/CSV'],
  // Workbook B: restrained modern design preferred over generic corporate
  // template output, so the operator asks to see directions rather than
  // accepting whatever the factory would default to.
  design_control: 'show-design-directions',
  hard_constraints: [
    'No unsupported performance, client, award, accreditation or experience claims',
    'No republication of nbm website photographs, logo files or staff photographs',
    'Imagery must be genuinely relevant and rights-safe',
    'Mobile must feel designed rather than collapsed',
  ],
  company_identity: {
    name: 'nbm Construction Cost Consultants',
    legalName: 'NBM CONSTRUCTION COST CONSULTANTS LIMITED',
    description: 'Construction cost consultancy and quantity surveying practice incorporated in Scotland on 6 March 2002, company number SC228801. Registered office 9 Woodside Crescent, Glasgow, G3 7UL. Principal activity: quantity surveying activities.',
  },
  // Workbook A: Services sheet, verbatim service lines.
  services: [
    'Cost Consultancy and Quantity Surveying',
    'Employer’s Agent',
    'Project Management',
    'Building Surveying and Defect Analysis',
  ],
  // Workbook A: Offices sheet.
  locations: ['Glasgow', 'Edinburgh'],
  conversion: ['call', 'email', 'contact form'],
  existing_site: 'https://www.nbm.bz/',
  contact_details: {
    phone: '0141 333 1836',
    address: '9 Woodside Crescent, Glasgow, G3 7UL',
  },
  // `trust` is deliberately left unanswered. The workbook forbids unsupported
  // proof and withholds case studies, and trial finding F23 recorded intake
  // trust answers being published as the company's own proof. An empty answer
  // is the truthful one.
  // `expected_scale`, `cost_priority`, `seo_priority` and `content_approval`
  // are left at their questionnaire defaults: the workbook says nothing about
  // them, and the bundle records them as accepted defaults, not as answers.
};

const sourceReferences = [
  {
    id: 'nbm-approved-workbook',
    kind: 'spreadsheet',
    label: 'Owner-approved nbm acceptance workbook',
    name: 'nbm-genuine-business-acceptance.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    provenance: 'user-supplied',
    purpose: 'Verified public facts, services, offices and the acceptance intent the build must satisfy.',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'requirement',
    sourceChannel: 'upload',
    publishUseAllowed: true,
    recordedAt: '2026-08-26T00:00:00.000Z',
  },
  {
    id: 'nbm-public-website',
    kind: 'url',
    label: 'nbm public website',
    uri: 'https://www.nbm.bz/',
    provenance: 'existing-site',
    purpose: 'Cross-check the facts the workbook records. Reference only: public visibility is not a republication right.',
    rightsStatus: 'reference-only',
    sourceRole: 'research',
    sourceChannel: 'website',
    publishUseAllowed: false,
    recordedAt: '2026-08-26T00:00:00.000Z',
  },
];

const bundle = mintApprovedIntakeBundle({
  projectType: 'marketing-site',
  // Thorough: an acceptance run should answer every question the questionnaire
  // asks rather than the quick subset.
  mode: 'thorough',
  answers,
  sourceReferences,
  capabilityDecisions: {},
  provenance: {
    producedBy: 'operator-authored',
    note: 'Canonical Phase 3.8E nbm acceptance intake, v1. Replays without re-keying the questionnaire.',
    replacesUnrecoverableIntake: {
      reason: 'The intake that produced the original nbm Build Contract and Manifest was never persisted, and is not present in any branch, commit or durable service state in this repository. It cannot be recovered, so this bundle is a new baseline rather than a reconstruction of it.',
      baselineFrom: [
        'examples/genuine-business/nbm-genuine-business-acceptance.xlsx',
        'docs/GENUINE_BUSINESS_ACCEPTANCE.md',
        'docs/TRIAL_FINDINGS.md',
      ],
    },
  },
});

// The bundle carries a creation timestamp and a random id, and neither belongs
// in a committed artifact that has to be regenerable byte-for-byte. Both are
// pinned to the approval this baseline is authored against.
bundle.bundleId = 'intake-nbm-acceptance-v1';
bundle.createdAt = '2026-08-26T00:00:00.000Z';
bundle.buildContract.approvedAt = bundle.createdAt;

const out = process.argv[2] ?? 'examples/genuine-business/nbm-approved-intake.v1.json';
fs.writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
console.log('wrote', out, `${fs.statSync(out).size} bytes`, `contract ${bundle.buildContractHash.slice(0, 12)}`, `manifest ${bundle.projectManifestHash.slice(0, 12)}`);
