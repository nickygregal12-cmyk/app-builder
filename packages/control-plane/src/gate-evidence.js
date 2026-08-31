/**
 * Real deterministic evidence, resolved into gate results.
 *
 * `evaluateConvergence` has always accepted a gate result per required gate and
 * refused to converge while any of them is `not-run`. Nothing produced them, so
 * every required gate was `not-run` and the refusal was the only thing the
 * convergence contract had ever demonstrated. This is the missing half: the
 * translation from an artifact a real producer wrote to the status a gate
 * carries.
 *
 * The translation is where the lie would live, so it is deliberately narrow:
 *
 *   - A command exiting zero is not a result. Status comes from named fields of
 *     a machine-readable artifact, and an artifact that cannot be read, parsed
 *     or matched to this build is `not-run` — never a pass by omission.
 *   - Evidence belongs to one build. An artifact whose build reference does not
 *     match the build being assessed is refused as another build's evidence.
 *     Staleness is the same refusal with a friendlier name, and both are
 *     `not-run` rather than a soft pass.
 *   - A deterministic check never stands in for a person. A gate that declares
 *     `requiresIndependentReviewer` stays `not-run` until a verdict exists,
 *     however many of its checks pass. Rule 17 is not something evidence can
 *     buy its way past.
 *   - A check with no registered producer is left `not-run` and the gate with
 *     it, because a gate nobody can measure has not passed.
 *
 * Nothing here runs a producer. Reading is the only thing it does, and the
 * command that collects the artifacts is `tooling/gate-evidence.mjs`.
 */

/** Why a check could not be decided. Each one is a refusal, never a pass. */
export const EVIDENCE_REFUSALS = Object.freeze([
  'no-registered-producer',
  'artifact-missing',
  'artifact-unreadable',
  'evidence-for-another-project',
  'evidence-for-another-build',
  'evidence-for-another-artifact-revision',
  'build-reference-missing',
  'conflicting-evidence',
]);

/** What a resolved check can be. `not-run` carries a refusal reason. */
export const CHECK_STATUSES = Object.freeze(['pass', 'fail', 'not-run']);

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`);
  return value;
}

/**
 * Validate the producer registry against the gate registry.
 *
 * Both directions are refusals rather than warnings. A check declared for a
 * gate that does not name it would silently decide nothing; the same check
 * declared twice would let two producers disagree about one status, and
 * whichever the reader happened to see last would win.
 */
export function assertProducerRegistry(registry, gates) {
  const producers = registry?.producers ?? {};
  const checks = registry?.checks ?? {};
  const seen = new Map();
  for (const [checkId, entry] of Object.entries(checks)) {
    if (entry?.id !== checkId) throw new Error(`Gate producer registry: check ${checkId} declares id ${entry?.id ?? 'nothing'}.`);
    const producerId = text(entry.producer, `Check ${checkId} producer`);
    if (!producers[producerId]) throw new Error(`Check ${checkId} names an unregistered producer: ${producerId}.`);
    const gateId = text(entry.gate, `Check ${checkId} gate`);
    const gate = gates?.[gateId];
    if (!gate) throw new Error(`Check ${checkId} names an unregistered gate: ${gateId}.`);
    if (!(gate.deterministicChecks ?? []).includes(checkId)) {
      throw new Error(`Gate ${gateId} does not declare check ${checkId}, so nothing would read its result.`);
    }
    const key = `${gateId}::${checkId}`;
    if (seen.has(key)) throw new Error(`Check ${checkId} is declared twice for gate ${gateId}.`);
    seen.set(key, entry);
  }
  for (const [producerId, producer] of Object.entries(producers)) {
    if (producer?.id !== producerId) throw new Error(`Gate producer registry: producer ${producerId} declares id ${producer?.id ?? 'nothing'}.`);
    text(producer.command, `Producer ${producerId} command`);
    text(producer.artifactKind, `Producer ${producerId} artifactKind`);
    text(producer.buildRefField, `Producer ${producerId} buildRefField`);
    // Which run produces this artifact. Without it, integrity cannot tell a
    // lane that failed to produce its own evidence from one that was never
    // going to, and every check produced elsewhere reads as broken wiring.
    text(producer.lane, `Producer ${producerId} lane`);
  }
  return { producerCount: Object.keys(producers).length, checkCount: Object.keys(checks).length };
}

function refuse(checkId, gateId, producerId, reason, detail) {
  return { id: checkId, gateId, producerId, status: 'not-run', reason, detail, ref: null, hash: null, coverage: null, boundToArtifact: false };
}

/**
 * What the producer actually looked at, when it can say.
 *
 * A check that passes over nothing is still a true statement and a nearly
 * worthless one, and the difference is invisible in a status. Where the
 * artifact records how many subjects it examined, that number travels with the
 * pass so a reader can see whether it was earned.
 */
function coverageOf(check, value) {
  if (!check.coverageField) return null;
  const count = value[check.coverageField];
  if (typeof count !== 'number') return null;
  return { label: check.coverageLabel ?? check.coverageField, value: count };
}

/**
 * Decide one check from one artifact.
 *
 * `failOnFindings` is the only decision rule in the registry, and it is enough
 * for every producer registered today: a report lists findings by check id, and
 * the gate check fails when any of the named ones is present. Adding a second
 * rule shape is a change to this function, deliberately, so that a new way of
 * reading a report is reviewed rather than configured.
 */
export function decideCheck({ check, producer, artifact, build }) {
  const checkId = check.id;
  const gateId = check.gate;
  const producerId = producer.id;
  if (!artifact) return refuse(checkId, gateId, producerId, 'artifact-missing', `${producer.command} has not been run for this build.`);
  if (artifact.error) return refuse(checkId, gateId, producerId, 'artifact-unreadable', artifact.error);

  const value = artifact.value;
  if (value === null || typeof value !== 'object') {
    return refuse(checkId, gateId, producerId, 'artifact-unreadable', `${artifact.ref} is not a JSON object.`);
  }

  // Evidence is bound to one build before it is read at all. An artifact from
  // another project or another composition describes something else, and the
  // most dangerous thing this module could do is grade this build against it.
  if (build?.projectId && artifact.projectId && artifact.projectId !== build.projectId) {
    return refuse(checkId, gateId, producerId, 'evidence-for-another-project', `evidence is for project ${artifact.projectId}, not ${build.projectId}.`);
  }
  const recorded = value[producer.buildRefField] ?? null;
  if (recorded === null || recorded === undefined) {
    return refuse(checkId, gateId, producerId, 'build-reference-missing', `${artifact.ref} records no ${producer.buildRefField}, so it cannot be tied to a build.`);
  }
  if (build?.buildRef && recorded !== build.buildRef) {
    return refuse(checkId, gateId, producerId, 'evidence-for-another-build', `${producer.buildRefField} ${recorded} is not this build's ${build.buildRef}.`);
  }

  // A composition hash is not an artifact. Two builds of one composition can
  // install different dependency graphs and produce different bytes, and every
  // one of them carries the same hash — so the check above cannot tell a report
  // about today's output from one about yesterday's.
  //
  // A producer that records the artifact revision it measured gets the stronger
  // check. One that does not is read as before and reported as unbound, because
  // refusing every existing producer the day this landed would have replaced a
  // weak check with no check at all. `boundToArtifact` is what a promotion rule
  // reads when it needs the difference.
  const measuredRevision = value.artifactRevisionId ?? null;
  if (build?.artifactRevisionId && measuredRevision && measuredRevision !== build.artifactRevisionId) {
    return refuse(checkId, gateId, producerId, 'evidence-for-another-artifact-revision', `evidence measured artifact revision ${measuredRevision}, not ${build.artifactRevisionId}.`);
  }
  const boundToArtifact = Boolean(build?.artifactRevisionId && measuredRevision && measuredRevision === build.artifactRevisionId);

  const findings = Array.isArray(value[check.findingsField]) ? value[check.findingsField] : null;
  if (findings === null) {
    return refuse(checkId, gateId, producerId, 'artifact-unreadable', `${artifact.ref} has no ${check.findingsField} array.`);
  }
  const failing = findings.filter((finding) => (check.failOnFindings ?? []).includes(finding?.[check.findingIdField]));
  return {
    id: checkId,
    gateId,
    producerId,
    status: failing.length === 0 ? 'pass' : 'fail',
    reason: null,
    detail: failing.length === 0
      ? `${findings.length} finding(s), none of them ${(check.failOnFindings ?? []).join('/')}`
      : failing.map((finding) => `${finding[check.findingIdField]}: ${finding.detail ?? finding.title ?? 'no detail'}`).join('; '),
    ref: artifact.ref,
    hash: artifact.hash ?? null,
    coverage: coverageOf(check, value),
    boundToArtifact,
  };
}

/**
 * Resolve every required gate of a pipeline into the result shape
 * `evaluateConvergence` consumes.
 *
 * `artifacts` is keyed by producer id. `verdicts` is keyed by gate id and is
 * how an independent reviewer's judgement enters — deterministic evidence
 * cannot supply it and does not pretend to.
 */
export function resolveGateResults({ gates, requiredGates, registry, artifacts = {}, build = null, verdicts = {} }) {
  assertProducerRegistry(registry, gates);
  const checksByGate = new Map();
  for (const entry of Object.values(registry?.checks ?? {})) {
    if (!checksByGate.has(entry.gate)) checksByGate.set(entry.gate, []);
    checksByGate.get(entry.gate).push(entry);
  }

  const results = {};
  const resolutions = [];
  for (const gateId of requiredGates) {
    const gate = gates?.[gateId];
    if (!gate) throw new Error(`Gate evidence references an unregistered gate: ${gateId}`);

    const declared = gate.deterministicChecks ?? [];
    const registered = new Map((checksByGate.get(gateId) ?? []).map((entry) => [entry.id, entry]));
    const checks = declared.map((checkId) => {
      const entry = registered.get(checkId);
      if (!entry) return refuse(checkId, gateId, null, 'no-registered-producer', 'no producer answers this check yet.');
      const producer = registry.producers[entry.producer];
      return decideCheck({ check: entry, producer, artifact: artifacts[entry.producer] ?? null, build });
    });

    const verdict = verdicts[gateId] ?? null;
    const unrun = checks.filter((check) => check.status === 'not-run');
    const failed = checks.filter((check) => check.status === 'fail');

    let status;
    const blockers = [];
    if (failed.length > 0) {
      status = 'fail';
      for (const check of failed) blockers.push(`check-failed:${check.id}`);
    } else if (unrun.length > 0) {
      status = 'not-run';
      for (const check of unrun) blockers.push(`check-not-run:${check.id}:${check.reason}`);
    } else if (declared.length === 0) {
      // A gate with no deterministic check is not deterministically decidable.
      // Saying so is the whole point; inferring a pass from an empty list is
      // how "every check passed" comes to mean "no check ran".
      status = 'not-run';
      blockers.push('gate-has-no-deterministic-checks');
    } else if (gate.requiresIndependentReviewer && !verdict) {
      status = 'not-run';
      blockers.push('independent-verdict-missing');
    } else if (verdict) {
      status = verdict.status;
    } else {
      status = 'pass';
    }

    // Required evidence is the reviewer's material, and a gate whose evidence
    // is absent has nothing for the reviewer to look at.
    const missingEvidence = (gate.requiredEvidence ?? []).filter((kind) => !(build?.evidenceKinds ?? []).includes(kind));
    if (missingEvidence.length > 0 && status !== 'fail') {
      status = 'not-run';
      for (const kind of missingEvidence) blockers.push(`missing-evidence:${kind}`);
    }

    results[gateId] = {
      status,
      score: verdict?.score ?? null,
      severity: status === 'fail' ? (verdict?.severity ?? 'major') : undefined,
      failingCriteria: failed.map((check) => check.id),
      verdictId: verdict?.verdictId ?? null,
    };
    if (results[gateId].severity === undefined) delete results[gateId].severity;

    resolutions.push({
      gateId,
      status,
      requiresIndependentReviewer: gate.requiresIndependentReviewer === true,
      verdictId: verdict?.verdictId ?? null,
      checks,
      blockers: [...new Set(blockers)],
      evidence: checks.filter((check) => check.ref).map((check) => ({ checkId: check.id, ref: check.ref, hash: check.hash })),
    });
  }

  return { results, resolutions };
}

/** The one-line summary a report prints: how many gates real evidence now decides. */
export function summariseResolutions(resolutions) {
  const decided = resolutions.filter((entry) => entry.status === 'pass' || entry.status === 'fail');
  const byDeterministicEvidence = resolutions.filter(
    (entry) => entry.checks.length > 0 && entry.checks.every((check) => check.status !== 'not-run'),
  );
  return {
    gates: resolutions.length,
    decided: decided.length,
    passed: resolutions.filter((entry) => entry.status === 'pass').length,
    failed: resolutions.filter((entry) => entry.status === 'fail').length,
    notRun: resolutions.filter((entry) => entry.status === 'not-run').length,
    everyCheckAnswered: byDeterministicEvidence.map((entry) => entry.gateId),
    awaitingIndependentVerdict: resolutions
      .filter((entry) => entry.blockers.includes('independent-verdict-missing'))
      .map((entry) => entry.gateId),
  };
}

/**
 * Whether the registered evidence path itself completed for this lane.
 *
 * A resolved `fail` is still sound evidence: it says the measured product did
 * not meet its gate. Only `not-run` (or a registered check missing from the
 * lane's resolution altogether) is an integrity failure. Keeping that
 * distinction here prevents CI from being made green by weakening a product
 * threshold, and prevents an unpaid product gate from masquerading as broken
 * evidence wiring.
 */
export function evaluateEvidenceIntegrity({ resolutions, registry, lane = null }) {
  const byGate = new Map((resolutions ?? []).map((entry) => [entry.gateId, entry]));
  const producers = registry?.producers ?? {};
  const failures = [];
  const otherLanes = [];
  let expectedChecks = 0;
  let resolvedChecks = 0;

  for (const check of Object.values(registry?.checks ?? {})) {
    const gate = byGate.get(check.gate);
    // A registry can serve several pipeline classes. A check is expected in
    // this lane only when its owning gate is one of this lane's resolutions.
    if (!gate) continue;

    // And only when this lane is the one that produces it. A lane builds one
    // thing and measures it; a producer that builds a different project cannot
    // answer for this build, and calling that broken evidence wiring is what
    // kept three real producers unregistered rather than admitting the gate
    // they answer is measured somewhere else.
    const producerLane = producers[check.producer]?.lane ?? null;
    if (lane && producerLane && producerLane !== lane) {
      otherLanes.push({ checkId: check.id, gateId: check.gate, producerId: check.producer, lane: producerLane });
      continue;
    }
    expectedChecks += 1;
    const resolution = gate.checks.find((entry) => entry.id === check.id);
    if (!resolution) {
      failures.push({ checkId: check.id, gateId: check.gate, producerId: check.producer, reason: 'resolution-missing' });
    } else if (resolution.status === 'not-run') {
      failures.push({ checkId: check.id, gateId: check.gate, producerId: check.producer, reason: resolution.reason });
    } else {
      resolvedChecks += 1;
    }
  }

  return {
    status: failures.length === 0 && expectedChecks > 0 ? 'pass' : 'fail',
    lane,
    // Named rather than silently skipped. A check this lane does not produce is
    // still a check somebody has to run, and a reader who cannot see which ones
    // were deferred cannot tell coverage from omission.
    deferredToOtherLanes: otherLanes,
    expectedChecks,
    resolvedChecks,
    failures,
  };
}
