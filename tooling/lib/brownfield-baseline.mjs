/**
 * The fixed point a later change is measured against.
 *
 * "This is better than before" is a claim about a *before*, and without one it
 * is an opinion. A baseline is what makes the sentence checkable: at exactly
 * this revision, this repository was shaped like this, had these test and gate
 * surfaces, and stated these things about itself.
 *
 * It is deliberately small. It does not copy the repository — git already holds
 * every byte at that revision, and a second copy would drift. It does not
 * freeze `node_modules` or `dist`. What it stores is identity plus the handful
 * of numbers a later comparison actually reads, and a pointer to the profile
 * that produced them.
 *
 * ## When a baseline is refused
 *
 * A baseline over a dirty working tree is not a fixed point: no revision names
 * what was profiled, so nothing can return to it. A baseline over a partial
 * walk describes part of a repository while appearing to describe all of it.
 * Both are refused with the reason, because a baseline that cannot be returned
 * to is worse than none — it makes a later comparison look rigorous.
 */

const KNOWN = new Set(['demonstrated', 'inferred']);

function stated(finding) {
  return finding && KNOWN.has(finding.status) ? finding.value : null;
}

function countOf(finding) {
  const value = stated(finding);
  if (value === null) return null;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object' && typeof value.count === 'number') return value.count;
  return null;
}

/**
 * Derive a baseline from a profile.
 *
 * The profile is the evidence; this is the small durable record that points at
 * it. Both travel together — a baseline whose profile is gone can say what was
 * true and not why anybody believed it.
 */
export function deriveBaseline(profile) {
  const refusals = [];
  const revision = stated(profile.repository?.commit);
  const clean = stated(profile.repository?.clean);

  if (!revision) {
    refusals.push('The repository has no resolvable revision, so there is no fixed point to compare a later change against.');
  }
  if (clean === false) {
    refusals.push('The working tree had uncommitted changes when it was profiled. What was measured is not what any revision names, so this baseline could not be returned to.');
  }
  if (clean === null) {
    refusals.push('Whether the working tree was clean could not be established, so it cannot be treated as a fixed point.');
  }
  if (profile.coverage?.truncated) {
    refusals.push(`The profile walk stopped at ${profile.coverage.limits?.maxFiles} files, so it describes part of this repository while reading as though it described all of it.`);
  }

  return {
    schemaVersion: 1,
    authority: 'brownfield-baseline',
    // The remote, not just the path. A baseline recorded in a worktree or a
    // temporary clone names a directory that will not exist next week, and a
    // record whose subject cannot be resolved later is not a fixed point.
    subject: { ...profile.subject, remote: stated(profile.repository?.remote) },
    revision: revision ?? null,
    workingTreeClean: clean,
    profiledAt: profile.profiledAt,
    // The binding. A baseline and a profile that disagree are two records of
    // two different reads, and this is what catches that.
    profileHash: profile.profileHash,

    /**
     * What a later comparison actually reads.
     *
     * Counts rather than contents, because the question a comparison asks is
     * "did this move, and in which direction?" — and a baseline that stored
     * every route would be a copy of the repository wearing a different name.
     */
    shape: {
      filesExamined: profile.coverage?.filesExamined ?? null,
      framework: stated(profile.stack?.framework),
      language: stated(profile.stack?.language),
      applications: countOf(profile.architecture?.applications),
      libraries: countOf(profile.architecture?.libraries),
      routeLocations: countOf(profile.architecture?.routeLocations),
      serverBoundaries: countOf(profile.architecture?.serverBoundaries),
      migrations: countOf(profile.data?.migrations),
      securityPolicyFiles: countOf(profile.data?.securityPolicies),
      unitTestFiles: countOf(profile.testing?.unit),
      e2eTestFiles: countOf(profile.testing?.e2e),
      databaseTestFiles: countOf(profile.testing?.database),
      ciWorkflows: countOf(profile.testing?.continuousIntegration),
      componentDirectories: countOf(profile.designSystem?.componentDirectories),
      dependencyCount: stated(profile.stack?.dependencyCount),
    },

    /**
     * What this baseline does NOT protect, stated so nobody reads its silence
     * as coverage.
     *
     * This is the most important field in the record. A baseline of counts can
     * notice that a route disappeared; it cannot notice that a route still
     * exists and now returns the wrong thing. Protecting behaviour needs
     * executable evidence and rendered evidence bound to this revision, and
     * neither is produced by a read-only pass.
     */
    protects: [
      'The repository is identified by an exact revision, so a later change can be diffed against what was actually read.',
      'The shape counts above. A route location, migration, policy file, test file or CI workflow that disappears is visible as a number that moved.',
    ],
    doesNotProtect: [
      'Behaviour. Nothing was executed, so no journey, test result or build outcome is recorded and none may be assumed to have passed.',
      'Rendered experience. No page was loaded and no capture was taken, so how this product looks and behaves is not part of this baseline.',
      'Data safety. Policy files were located, never run. Whether they are correct is a live-database question.',
      'Meaning. A count that did not move does not prove the thing behind it is unchanged.',
    ],

    usable: refusals.length === 0,
    refusals,
  };
}

/**
 * Compare a later profile against a baseline.
 *
 * Reports movement, and refuses to call movement good or bad. A route location
 * disappearing might be a deletion or a refactor to a routing convention this
 * profiler does not recognise, and only a person with the ChangeSet in front of
 * them can tell which.
 */
export function compareToBaseline(baseline, profile) {
  if (!baseline?.usable) {
    return { comparable: false, reason: 'The baseline was not usable when it was recorded, so nothing may be measured against it.', changes: [] };
  }
  const later = deriveBaseline(profile);
  const changes = [];
  for (const [key, before] of Object.entries(baseline.shape)) {
    const after = later.shape[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({ field: key, before, after });
  }
  return {
    comparable: true,
    sameRevision: baseline.revision === later.revision,
    sameProfile: baseline.profileHash === later.profileHash,
    changes,
    // Said every time, because a diff of numbers reads as a verdict if nothing
    // stops it reading that way.
    note: 'Movement, not judgement. A number that moved is a question for whoever made the change, and a number that did not move does not prove the thing behind it is unchanged.',
  };
}
