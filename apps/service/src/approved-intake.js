import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertContract } from '@app-builder/contracts';
import {
  approveBuildContract,
  applyQuestionDefaults,
  buildBuildContract,
  buildProjectManifest,
  canonicalJson,
  createApprovedIntakeBundle,
  createSourceReference,
  mergeQuestionnaires,
  questionsForMode,
  replayApprovedIntakeBundle,
} from '@app-builder/factory-core';

// The factory root is the authority on which questions exist. Replay reads the
// same definitions the Console asks from, so an approved intake can never be
// replayed against a questionnaire this factory does not actually ask.
function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

export function questionnaireCatalog() {
  const projectTypes = readJson('config/project-types.json');
  const modules = readJson('config/modules.json');
  return { projectTypesConfig: { ...projectTypes, moduleRegistry: modules }, base: readJson('questionnaires/v1/base.json') };
}

export function questionsFor(projectType) {
  const { projectTypesConfig, base } = questionnaireCatalog();
  const typeConfig = projectTypesConfig.projectTypes?.[projectType];
  if (!typeConfig) throw new Error(`Unknown project type: ${projectType}`);
  const specific = readJson(`questionnaires/v1/${typeConfig.questionnaire}.json`);
  return { questions: mergeQuestionnaires(base, specific), projectTypesConfig, questionnaireVersion: String(base.version) };
}

export function hashArtifact(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * Hash the decisions in a Build Contract, not the moment it was approved.
 *
 * `approvedAt` is a timestamp, so including it would make two identical
 * approvals disagree and make every replay of a bundle look like drift.
 */
export function hashBuildContract(contract) {
  const { approvedAt, ...decisions } = contract;
  return hashArtifact(decisions);
}

/**
 * Mint the durable record of an approved intake.
 *
 * The service builds the Build Contract and Manifest itself rather than
 * trusting ones the browser assembled, so what is persisted is what this
 * factory's own contract builders produce from the operator's answers.
 */
export function mintApprovedIntakeBundle({ projectType, mode = 'standard', answers = {}, sourceReferences = [], capabilityDecisions = {}, feedback = [], provenance = {} }) {
  const { questions, projectTypesConfig, questionnaireVersion } = questionsFor(projectType);
  const seeded = applyQuestionDefaults(questions, { project_type: projectType, ...answers });
  const visible = questionsForMode(questions, mode, seeded);
  const sources = sourceReferences.map(createSourceReference);
  const contract = buildBuildContract({ projectType, answers: seeded, questions: visible, projectTypesConfig, sourceReferences: sources, capabilityDecisions });
  if (contract.unresolvedHighImpactQuestions.length) throw new Error(`Approved intake still has unresolved high-impact questions: ${contract.unresolvedHighImpactQuestions.join('; ')}`);
  if (contract.unresolvedCapabilityDecisions.length) throw new Error(`Approved intake still has unresolved capability decisions: ${contract.unresolvedCapabilityDecisions.join('; ')}`);
  const buildContract = approveBuildContract(contract);
  const projectManifest = buildProjectManifest({ projectType, answers: seeded, projectTypesConfig, sourceReferences: sources, capabilityDecisions });
  const bundle = createApprovedIntakeBundle({
    bundleId: `intake-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    provenance: { producedBy: 'console-intake', ...provenance },
    projectType,
    mode,
    questionnaireVersion,
    questions,
    answers: seeded,
    sourceReferences: sources,
    capabilityDecisions,
    feedback,
    buildContract,
    projectManifest,
    buildContractHash: hashBuildContract(buildContract),
    projectManifestHash: hashArtifact(projectManifest),
  });
  assertContract('approved-intake-bundle', bundle);
  return bundle;
}

/**
 * Rebuild approved intent from a durable bundle.
 *
 * The bundle is validated against its contract first, then replayed through the
 * same builders normal intake uses. Nothing generated is restored: the caller
 * gets a Manifest to build from scratch, and a `reused` summary to show the
 * operator what they are accepting.
 */
export function replayApprovedIntake(bundle) {
  assertContract('approved-intake-bundle', bundle);
  const { questions, projectTypesConfig, questionnaireVersion } = questionsFor(bundle.questionnaire.projectType);
  const replayed = replayApprovedIntakeBundle(bundle, { questions, questionnaireVersion, projectTypesConfig });

  // A rebuilt contract that no longer hashes to the approved one is not a
  // failure — the factory improves — but it is never hidden. The operator is
  // told the decisions were preserved and the output was rebuilt.
  const drift = [...replayed.drift];
  const rebuiltContractHash = hashBuildContract(replayed.buildContract);
  const rebuiltManifestHash = hashArtifact(replayed.projectManifest);
  if (rebuiltContractHash !== bundle.buildContractHash) {
    drift.push({ code: 'build-contract-rebuilt', severity: 'notice', detail: `The same answers now produce a different Build Contract (${bundle.buildContractHash.slice(0, 12)} -> ${rebuiltContractHash.slice(0, 12)}). The approved decisions were preserved; the contract was rebuilt by this factory.` });
  }
  if (rebuiltManifestHash !== bundle.projectManifestHash) {
    drift.push({ code: 'project-manifest-rebuilt', severity: 'notice', detail: `The same answers now produce a different Manifest (${bundle.projectManifestHash.slice(0, 12)} -> ${rebuiltManifestHash.slice(0, 12)}).` });
  }
  return { ...replayed, drift, rebuiltContractHash, rebuiltManifestHash };
}

/**
 * The bundle a replayed run records for itself.
 *
 * It keeps the approved answers and points back at the bundle it came from, so
 * a chain of reruns stays traceable without any of them claiming to be the
 * original approval.
 */
export function bundleForReplayedRun(bundle, replayed) {
  const next = {
    ...bundle,
    bundleId: `intake-${randomUUID()}`,
    createdAt: new Date().toISOString(),
    provenance: { ...bundle.provenance, producedBy: 'service-replay', replayedFromBundleId: bundle.bundleId },
    buildContract: replayed.buildContract,
    buildContractHash: replayed.rebuiltContractHash,
    projectManifest: replayed.projectManifest,
    projectManifestHash: replayed.rebuiltManifestHash,
  };
  assertContract('approved-intake-bundle', next);
  return next;
}
