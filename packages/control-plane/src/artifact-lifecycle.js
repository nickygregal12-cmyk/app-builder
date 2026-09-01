/**
 * The one lifecycle a candidate product travels, as a pure reducer.
 *
 * The factory had several words for readiness and no single ladder. `generated`
 * meant a directory existed. `verified` meant `npm install && npm run check &&
 * npm run build` exited zero — under a floating dependency resolution, with no
 * record of what was built. `launchable` meant the deterministic launch audit
 * found no blocker finding, which it can report while rendered evidence is
 * missing entirely. Visual promotion meant a person preferred one candidate to
 * another. Each was true about its own narrow question, and none of them was
 * "this exact artifact is fit to publish" — but read together they could be
 * mistaken for it.
 *
 * So the states here are deliberately unhelpful to anyone hoping to skip one:
 *
 *   - Each success state is reachable only from the state directly below it.
 *     There is no path that reaches `released` without having earned
 *     `behavior-verified`, whatever the caller believes about the artifact.
 *   - A state that needs an identity component cannot be entered without it.
 *     `buildable` needs the lockfile, the toolchain and the built output,
 *     because a build whose transitive dependencies were re-resolved and whose
 *     output was never recorded has not proved it can be reproduced.
 *   - Identity is append-only. A component is written once by the transition
 *     that earns it, and a second, different value is a refusal rather than an
 *     update: changed bytes must not inherit the evidence of the bytes they
 *     replaced. Rework therefore forks a child revision that starts again at
 *     `contract-approved` and re-earns everything below it, and the parent is
 *     superseded rather than edited.
 *   - The producer of a revision cannot accept it (principle 17), so
 *     `quality-accepted` refuses an actor who materialised the thing it judges.
 *
 * What this module deliberately does not do: decide whether a digest is
 * genuine, whether evidence is fresh, whether the reviewer was independent in
 * any sense stronger than "not this producer", or whether an operation was
 * authorised. Those are the evidence reducer's, the authorization contract's
 * and the release contract's jobs. This module owns the ladder and identity,
 * and refuses everything that would let a state be claimed without them.
 */

import { randomUUID } from 'node:crypto';

/** The success ladder, in order. Index is the only ordering; there is no other. */
export const ARTIFACT_LIFECYCLE_STATES = Object.freeze([
  'contract-approved',
  'materialized',
  'buildable',
  'behavior-verified',
  'quality-accepted',
  'release-candidate',
  'released',
  'production-verified',
]);

/** Ends, not achievements. A disposition is never a success state. */
export const ARTIFACT_TERMINAL_DISPOSITIONS = Object.freeze(['superseded', 'withdrawn', 'rejected']);

export const ARTIFACT_IDENTITY_COMPONENTS = Object.freeze(['contractDigest', 'sourceDigest', 'lockDigest', 'toolchain', 'outputDigest', 'deployId']);

/**
 * What each state means, in the terms the factory can actually check, and what
 * it explicitly does not mean. The second half is the point: every one of these
 * `notMeaning` lines is a claim somebody could otherwise have made from the
 * state name alone.
 */
export const ARTIFACT_LIFECYCLE_SEMANTICS = Object.freeze({
  'contract-approved': Object.freeze({
    meaning: 'An owner approved an exact Product Contract digest: the facts, assumptions, constraints, journeys, acceptance criteria and budget this revision is built against.',
    notMeaning: 'That a repository, a product or any code exists.',
  }),
  materialized: Object.freeze({
    meaning: 'A portable source tree exists and hashes to a recorded digest against the approved contract.',
    notMeaning: 'That it installs, checks, builds, behaves correctly or is of acceptable quality.',
  }),
  buildable: Object.freeze({
    meaning: 'That exact source, with that exact lockfile, under that exact declared toolchain, clean-installs, passes its declared checks, builds, and produces the recorded output digest.',
    notMeaning: 'Anything about behaviour, visual quality, release or production.',
  }),
  'behavior-verified': Object.freeze({
    meaning: 'The required deterministic journeys, states and applicable accessibility, performance, security and data gates passed against a preview of this exact output.',
    notMeaning: 'That the product is professionally or commercially good enough to publish.',
  }),
  'quality-accepted': Object.freeze({
    meaning: 'An independent critic — never the producer — accepted this exact behaviour-verified revision against the approved acceptance criteria.',
    notMeaning: 'Permission to release. Until the model critic is calibrated, professional and public acceptance also requires human authority.',
  }),
  'release-candidate': Object.freeze({
    meaning: 'An immutable package binds this accepted revision, its output, its evidence, one target environment contract, the adapter identity and a recovery target.',
    notMeaning: 'Permission to publish. A candidate is a thing that could be published, not a decision to publish it.',
  }),
  released: Object.freeze({
    meaning: 'The exact provider deploy this candidate names is live on the named target under an explicit Release Approval.',
    notMeaning: 'That production behaviour has been checked. It has not been, yet.',
  }),
  'production-verified': Object.freeze({
    meaning: 'The required production smoke and health checks passed against the live provider identity for this exact deploy. This is the terminal success state for this revision.',
    notMeaning: 'That later change is free. A later change is a child revision, which earns the ladder again from the bottom.',
  }),
});

/**
 * The identity components a state cannot be entered without. Cumulative by
 * position: entering a state requires its own components and every earlier
 * state's, because the ladder is walked one rung at a time.
 */
const REQUIRED_IDENTITY = Object.freeze({
  'contract-approved': Object.freeze(['contractDigest']),
  materialized: Object.freeze(['sourceDigest']),
  buildable: Object.freeze(['lockDigest', 'toolchain', 'outputDigest']),
  'behavior-verified': Object.freeze([]),
  'quality-accepted': Object.freeze([]),
  'release-candidate': Object.freeze([]),
  released: Object.freeze(['deployId']),
  'production-verified': Object.freeze([]),
});

/**
 * States whose whole content is "somebody or something else checked this".
 * Entering one without naming the evidence is the claim without the check.
 */
const REQUIRES_EVIDENCE = Object.freeze(new Set(['behavior-verified', 'quality-accepted', 'release-candidate', 'released', 'production-verified']));

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function isDigest(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function normalizeToolchain(value) {
  if (value === null || value === undefined) return null;
  const node = requireText(value.node, 'Toolchain node version');
  const npm = requireText(value.npm, 'Toolchain npm version');
  return { node, npm };
}

function normalizeIdentityComponent(component, value) {
  if (value === null || value === undefined) return null;
  if (component === 'toolchain') return normalizeToolchain(value);
  if (component === 'deployId') return requireText(value, 'Artifact identity deployId');
  if (!isDigest(value)) throw new Error(`Artifact identity ${component} must be a SHA-256 hex digest.`);
  return value;
}

function sameComponent(component, left, right) {
  if (component === 'toolchain') {
    if (left === null || right === null) return left === right;
    return left.node === right.node && left.npm === right.npm;
  }
  return left === right;
}

function emptyIdentity() {
  return Object.fromEntries(ARTIFACT_IDENTITY_COMPONENTS.map((component) => [component, null]));
}

function normalizeIdentity(patch) {
  const identity = {};
  for (const component of ARTIFACT_IDENTITY_COMPONENTS) {
    identity[component] = normalizeIdentityComponent(component, patch?.[component]);
  }
  return identity;
}

/**
 * Append-only merge. Writing a component that is already set to a different
 * value is the drift refusal, and it is the whole reason rework forks rather
 * than edits: if this returned quietly, a revision could swap its bytes and
 * keep the evidence earned by the bytes it replaced.
 */
function mergeIdentity(current, patch) {
  const incoming = normalizeIdentity(patch);
  const merged = { ...current };
  const drifted = [];
  for (const component of ARTIFACT_IDENTITY_COMPONENTS) {
    if (incoming[component] === null) continue;
    if (merged[component] === null) {
      merged[component] = incoming[component];
      continue;
    }
    if (!sameComponent(component, merged[component], incoming[component])) drifted.push(component);
  }
  if (drifted.length) {
    throw new Error(`Artifact identity is append-only: ${drifted.join(', ')} already recorded with a different value. Fork a child revision instead of rewriting identity.`);
  }
  return merged;
}

function stateIndex(state) {
  return ARTIFACT_LIFECYCLE_STATES.indexOf(state);
}

export function isTerminalDisposition(state) {
  return ARTIFACT_TERMINAL_DISPOSITIONS.includes(state);
}

/**
 * The transition rule in one place: one rung up the ladder, or out of it.
 * Nothing moves down, and nothing leaves a disposition.
 */
export function nextArtifactStates(state) {
  if (isTerminalDisposition(state)) return Object.freeze([]);
  const index = stateIndex(state);
  if (index < 0) throw new Error(`Unknown artifact lifecycle state: ${state}`);
  const forward = index + 1 < ARTIFACT_LIFECYCLE_STATES.length ? [ARTIFACT_LIFECYCLE_STATES[index + 1]] : [];
  // A published, production-verified revision is not something a reviewer gets
  // to reject after the fact; it is superseded by a successor or withdrawn by
  // its owner. Rejection is a judgement about a candidate.
  const dispositions = state === 'released' || state === 'production-verified'
    ? ['superseded', 'withdrawn']
    : [...ARTIFACT_TERMINAL_DISPOSITIONS];
  return Object.freeze([...forward, ...dispositions]);
}

function transitionRecord({ from, to, actor, basis, evidenceRefs, at }) {
  return {
    from,
    to,
    actor: requireText(actor, 'Transition actor'),
    basis: requireText(basis, 'Transition basis'),
    evidenceRefs: [...new Set((evidenceRefs ?? []).map((ref) => requireText(ref, 'Transition evidenceRef')))],
    at,
  };
}

export function createArtifactRevision(input, now = new Date().toISOString()) {
  const projectId = requireText(input?.projectId, 'Artifact revision projectId');
  const producedBy = requireText(input?.producedBy, 'Artifact revision producedBy');
  const identity = mergeIdentity(emptyIdentity(), input?.identity);
  if (identity.contractDigest === null) {
    throw new Error('An artifact revision starts at contract-approved, which requires an approved contract digest.');
  }
  for (const component of ARTIFACT_IDENTITY_COMPONENTS) {
    if (component === 'contractDigest') continue;
    if (identity[component] !== null) {
      throw new Error(`A new artifact revision cannot already carry ${component}: nothing has been materialised yet.`);
    }
  }
  return {
    schemaVersion: 1,
    id: input.id ?? `revision-${randomUUID()}`,
    projectId,
    parentRevisionId: input.parentRevisionId ?? null,
    producedBy,
    lifecycleState: 'contract-approved',
    identity,
    history: [transitionRecord({
      from: null,
      to: 'contract-approved',
      actor: requireText(input.approvedBy ?? input.actor, 'Artifact revision approvedBy'),
      basis: requireText(input.basis ?? 'Product Contract approved by the owner.', 'Artifact revision basis'),
      evidenceRefs: input.evidenceRefs ?? [],
      at: now,
    })],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Move one rung up the ladder. Every refusal here is a claim the caller could
 * otherwise have made without the thing that earns it.
 */
export function advanceArtifactRevision(revision, nextState, details = {}, now = new Date().toISOString()) {
  if (isTerminalDisposition(revision.lifecycleState)) {
    throw new Error(`Artifact revision is ${revision.lifecycleState} and cannot advance.`);
  }
  if (!ARTIFACT_LIFECYCLE_STATES.includes(nextState)) {
    throw new Error(`Unknown artifact lifecycle state: ${nextState}`);
  }
  if (!nextArtifactStates(revision.lifecycleState).includes(nextState)) {
    throw new Error(`Invalid artifact transition: ${revision.lifecycleState} -> ${nextState}. Each state is earned only from the one below it.`);
  }

  const identity = mergeIdentity(revision.identity, details.identity);
  const missing = REQUIRED_IDENTITY[nextState].filter((component) => identity[component] === null);
  if (missing.length) {
    throw new Error(`${nextState} requires ${missing.join(', ')}: ${ARTIFACT_LIFECYCLE_SEMANTICS[nextState].meaning}`);
  }

  const evidenceRefs = details.evidenceRefs ?? [];
  if (REQUIRES_EVIDENCE.has(nextState) && evidenceRefs.length === 0) {
    throw new Error(`${nextState} is a statement about evidence and cannot be entered without naming any.`);
  }

  const actor = requireText(details.actor, 'Transition actor');
  if (nextState === 'quality-accepted' && actor === revision.producedBy) {
    throw new Error(`${revision.producedBy} produced this revision and cannot also accept it (principle 17).`);
  }

  return {
    ...revision,
    lifecycleState: nextState,
    identity,
    history: [...revision.history, transitionRecord({
      from: revision.lifecycleState,
      to: nextState,
      actor,
      basis: details.basis,
      evidenceRefs,
      at: now,
    })],
    updatedAt: now,
  };
}

export function disposeArtifactRevision(revision, disposition, details = {}, now = new Date().toISOString()) {
  if (!ARTIFACT_TERMINAL_DISPOSITIONS.includes(disposition)) {
    throw new Error(`Unknown artifact disposition: ${disposition}`);
  }
  if (isTerminalDisposition(revision.lifecycleState)) {
    throw new Error(`Artifact revision is already ${revision.lifecycleState}.`);
  }
  if (!nextArtifactStates(revision.lifecycleState).includes(disposition)) {
    throw new Error(`A ${revision.lifecycleState} revision cannot be ${disposition}.`);
  }
  return {
    ...revision,
    lifecycleState: disposition,
    history: [...revision.history, transitionRecord({
      from: revision.lifecycleState,
      to: disposition,
      actor: details.actor,
      basis: details.basis,
      evidenceRefs: details.evidenceRefs ?? [],
      at: now,
    })],
    updatedAt: now,
  };
}

/**
 * Rework. The child keeps the approved contract and nothing else, because
 * nothing else about it is the same thing yet: it has no source, no lock, no
 * output and therefore no evidence. The parent is superseded in the same
 * operation so the lineage never shows two live revisions of one contract.
 */
export function forkArtifactRevision(revision, details = {}, now = new Date().toISOString()) {
  if (isTerminalDisposition(revision.lifecycleState)) {
    throw new Error(`Artifact revision is ${revision.lifecycleState} and cannot be reworked.`);
  }
  const basis = requireText(details.basis, 'Rework basis');
  const child = createArtifactRevision({
    projectId: revision.projectId,
    parentRevisionId: revision.id,
    producedBy: details.producedBy ?? revision.producedBy,
    identity: { contractDigest: revision.identity.contractDigest },
    approvedBy: details.actor,
    basis: `Rework of ${revision.id}: ${basis}`,
    evidenceRefs: details.evidenceRefs ?? [],
    id: details.id,
  }, now);
  const parent = disposeArtifactRevision(revision, 'superseded', {
    actor: details.actor,
    basis: `Superseded by ${child.id}: ${basis}`,
    evidenceRefs: details.evidenceRefs ?? [],
  }, now);
  return { parent, child };
}

/**
 * Where a real revision stands, in the shape a project summary reports.
 *
 * This exists because the honest fallback was being applied to projects that
 * had earned better. `projectLegacyProjectState` reads the *project row*, which
 * records a workspace path and never a source digest, so it answers `null` —
 * "there is no exact artifact to attach a lifecycle to". That is the right
 * answer for an ungoverned build and the wrong one for a governed build, whose
 * revision is in the event ledger, climbing, and simply was not consulted. A
 * surface that reports `null` over a `materialized` revision is not being
 * careful; it is contradicting its own evidence.
 *
 * `missing` stays the same promise it makes for legacy data: what this artifact
 * would have to record to go one rung further. Evidence is named alongside the
 * identity components because a state whose whole content is "something else
 * checked this" cannot be entered by recording a digest.
 */
export function artifactRevisionPosition(revision, { legacyState = null } = {}) {
  const state = requireText(revision?.lifecycleState, 'Artifact revision lifecycleState');
  const latest = revision.history?.[revision.history.length - 1] ?? null;
  const described = describeArtifactState(state);
  const position = {
    lifecycleState: state,
    basis: latest?.basis ?? described.meaning,
    missing: [],
    legacyState,
    meaning: described.meaning,
    notMeaning: described.notMeaning,
  };
  if (isTerminalDisposition(state)) return position;
  const [next] = nextArtifactStates(state).filter((candidate) => !isTerminalDisposition(candidate));
  if (!next) return position;
  const missing = (REQUIRED_IDENTITY[next] ?? []).filter((component) => revision.identity?.[component] === null || revision.identity?.[component] === undefined);
  if (REQUIRES_EVIDENCE.has(next)) missing.push(`evidence:${next}`);
  return { ...position, missing };
}

/**
 * Legacy `project.state` values, read honestly.
 *
 * The temptation is to map `verified` to `buildable`, because both are about a
 * build succeeding. They are not the same claim. Legacy verification ran
 * `npm install`, so its dependency graph was re-resolved at run time and no
 * lockfile identity was recorded; it ran under whatever Node and npm the host
 * happened to have; and it recorded no digest of what was built. `buildable`
 * asserts all three. Projecting one onto the other would silently convert
 * every historical project into a reproducibility claim nobody ever made, and
 * the release ladder is built on exactly that claim.
 *
 * So legacy data reaches `materialized` at best, and carries the list of what
 * it would have to record to go further. That is the honest report, and it is
 * also the migration instruction.
 */
export function projectLegacyProjectState(legacy = {}, options = {}) {
  const position = legacyPosition(legacy, options);
  // Same single authority for what a state means as a real revision gets. A
  // surface that had to carry its own copy of these sentences would be a second
  // authority for the claim, which is the thing `notMeaning` exists to stop.
  const described = position.lifecycleState ? describeArtifactState(position.lifecycleState) : null;
  return { ...position, meaning: described?.meaning ?? null, notMeaning: described?.notMeaning ?? null };
}

function legacyPosition(legacy = {}, { declaredToolchain = null } = {}) {
  const state = String(legacy.state ?? '').trim();
  const known = ['draft', 'ready', 'generating', 'generated', 'verified', 'failed'];
  if (!known.includes(state)) {
    return {
      lifecycleState: null,
      basis: `Unknown legacy project state ${state ? `"${state}"` : '(absent)'}; nothing is claimed for it.`,
      missing: [],
      legacyState: state || null,
    };
  }

  if (state === 'failed' || state === 'generating') {
    return {
      lifecycleState: null,
      basis: state === 'failed'
        ? 'A failed build produced no revision. A failed attempt is an attempt, not a state of an artifact.'
        : 'A generation in flight has produced no recorded source tree yet.',
      missing: [],
      legacyState: state,
    };
  }

  if (state === 'draft' || state === 'ready') {
    const approved = Boolean(legacy.approvedBuildPlanId) && isDigest(legacy.contractDigest);
    return {
      lifecycleState: approved ? 'contract-approved' : null,
      basis: approved
        ? 'An approved build plan and its contract digest are recorded, which is exactly what contract-approved asserts.'
        : 'A project exists and its contract has not been approved with a recorded digest, so no revision has begun.',
      missing: approved ? ['sourceDigest'] : ['approvedBuildPlanId', 'contractDigest'],
      legacyState: state,
    };
  }

  // A verification that recorded a full build identity is not legacy data: it
  // recorded the lockfile it installed from, the toolchain it ran under and a
  // digest of what it built, which is exactly what `buildable` asserts. The
  // toolchain still has to be the declared one — a real record of a build under
  // an undeclared toolchain is an honest record of an unreproducible build.
  const identity = legacy.buildIdentity ?? null;
  if (state === 'verified' && identity) {
    const recorded = ['sourceDigest', 'lockDigest', 'outputDigest'].filter((component) => !isDigest(identity[component]));
    const toolchain = identity.toolchain ?? null;
    if (!toolchain?.node || !toolchain?.npm) recorded.push('toolchain');
    if (recorded.length === 0) {
      const supported = declaredToolchain ? toolchain.node === declaredToolchain.node && toolchain.npm === declaredToolchain.npm : null;
      if (supported === true) {
        return {
          lifecycleState: 'buildable',
          basis: `Installed from lockfile ${identity.lockDigest.slice(0, 12)} under node ${toolchain.node} / npm ${toolchain.npm}, and built output ${identity.outputDigest.slice(0, 12)}.`,
          missing: [],
          legacyState: state,
        };
      }
      return {
        lifecycleState: 'materialized',
        basis: supported === null
          ? 'A full build identity was recorded, but no declared toolchain was supplied to compare it against, so reproducibility is unasserted rather than proven.'
          : `The build ran under node ${toolchain.node} / npm ${toolchain.npm} rather than the declared node ${declaredToolchain.node} / npm ${declaredToolchain.npm}, so what it produced is recorded and not reproducible.`,
        missing: ['toolchain'],
        legacyState: state,
      };
    }
    return {
      lifecycleState: 'materialized',
      basis: `A build identity was recorded without ${recorded.join(', ')}, so it does not assert what buildable asserts.`,
      missing: recorded,
      legacyState: state,
    };
  }

  // `generated` and `verified` both mean a workspace exists. Neither recorded a
  // source digest, so neither reaches `materialized` on its own evidence.
  const hasSource = isDigest(legacy.sourceDigest);
  if (!hasSource) {
    return {
      lifecycleState: null,
      basis: `Legacy "${state}" recorded a workspace path rather than a source digest, so there is no exact artifact to attach a lifecycle to.`,
      missing: ['sourceDigest', 'lockDigest', 'toolchain', 'outputDigest'],
      legacyState: state,
    };
  }
  return {
    lifecycleState: 'materialized',
    basis: state === 'verified'
      ? 'Legacy verification installed with `npm install` under an undeclared toolchain and recorded no output digest, so it proves a build once ran, not that this artifact is reproducible. It stops at materialized.'
      : 'A source tree with a recorded digest exists against the approved contract.',
    missing: ['lockDigest', 'toolchain', 'outputDigest'],
    legacyState: state,
  };
}

/**
 * A one-line summary a surface can render without inventing a claim. Callers
 * that want to say something stronger than this have to go and earn it.
 */
export function describeArtifactState(state) {
  if (isTerminalDisposition(state)) {
    return {
      state,
      terminal: true,
      success: false,
      meaning: state === 'superseded'
        ? 'A child revision replaced this one. Its evidence stays with it and does not transfer.'
        : state === 'withdrawn'
          ? 'The owner withdrew this revision.'
          : 'An independent judgement rejected this revision.',
      notMeaning: 'A step in the success ladder.',
    };
  }
  const semantics = ARTIFACT_LIFECYCLE_SEMANTICS[state];
  if (!semantics) throw new Error(`Unknown artifact lifecycle state: ${state}`);
  return {
    state,
    terminal: state === 'production-verified',
    success: true,
    meaning: semantics.meaning,
    notMeaning: semantics.notMeaning,
  };
}
