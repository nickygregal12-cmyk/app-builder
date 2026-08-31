/**
 * Which modules are worth mutation testing, and what is supposed to be defending them.
 *
 * Separate from the runner so the registry can be read — and checked — without starting a run that
 * takes minutes. `tooling/mutation-strength.test.mjs` reads it inside `npm run check`.
 */

/**
 * The targets, and the tests that are supposed to be defending them.
 *
 * `equivalent` records the survivors that were examined and found unable to change behaviour. It is
 * not a suppression list: each entry has to say why, and `tooling/mutation-strength.test.mjs`
 * requires every id in it to still be a real mutation site, so an entry cannot outlive the line it
 * describes.
 */
export const MUTATION_TARGETS = Object.freeze([
  {
    id: 'execution-environment',
    file: 'packages/control-plane/src/execution-environment.js',
    why: 'The isolation shape itself: which host paths a sandbox may never mount, whether its root is read-only, which of its paths are writable, its uid/gid translation and whether it can reach a network at all. The broker removes a task\'s authority; this removes its route.',
    tests: [
      'tooling/agent-sandbox.test.mjs',
      'tooling/task-image-egress.test.mjs',
      'tooling/task-image-host-proof-regression.test.mjs',
      'tooling/model-canary.test.mjs',
    ],
    equivalent: [],
  },
  {
    id: 'capabilities',
    file: 'packages/control-plane/src/capabilities.js',
    why: 'Grant verification, environment scoping, approval and the attempt budget. Everything an agent has to get past to mutate anything.',
    tests: [
      'tooling/agent-capability-boundary.test.mjs',
      'tooling/agent-sandbox.test.mjs',
      'tooling/model-canary.test.mjs',
    ],
    equivalent: [
      {
        id: 'capabilities:178:or-to-and#2',
        why: 'Letting an array past the shape guard changes nothing: JSON cannot give an array a `version` property, so the very next check refuses it with the same `grant-malformed` reason.',
      },
      {
        id: 'capabilities:314:or-to-and#1',
        why: '`typeof x !== \'string\' && x === \'\'` can never be true, so the guard stops firing — and an empty or non-string operation then misses the registry and is refused as `unknown-operation` regardless. Same refusal, one branch later.',
      },
    ],
  },
  {
    id: 'egress-policy',
    file: 'packages/control-plane/src/egress-policy.js',
    why: 'Which destinations count as the public internet. A private address misclassified as public is the boundary failing open.',
    tests: [
      'tooling/task-image-egress.test.mjs',
    ],
    equivalent: [
      {
        id: 'egress-policy:61:or-to-and#1',
        why: 'A part is parsed from digits, hex or octal, so it can be unsafe-large but never negative. Requiring both conditions leaves the guard unreachable, and an oversized part is then refused by the range checks immediately below it instead.',
      },
      {
        id: 'egress-policy:77:false-to-true#1',
        why: 'The CIDR starts this compares against are literals in the forbidden table, all of them parseable, so the null branch is unreachable defence and its return value cannot be observed.',
      },
    ],
  },
  {
    id: 'control-plane-core',
    file: 'packages/control-plane/src/index.js',
    why: 'ChangeSet scope enforcement, the loop-guard budgets and the policy action check. AGENTS.md principles 13 and 15 are these functions.',
    tests: [
      'tooling/control-plane.test.mjs',
      'tooling/change-set-scope.property.test.mjs',
      'tooling/ledger-projection.test.mjs',
    ],
    equivalent: [
      {
        id: 'index:129:or-to-and#1',
        why: 'Defence in depth rather than a hole: a single-leading-slash path that slipped this disjunct still splits into an empty first segment, and the segment check below refuses it. The drive-letter and UNC spellings are separate disjuncts and are unaffected.',
      },
      {
        id: 'index:130:or-to-and#1',
        why: 'Same shape: a trailing separator leaves an empty last segment and a doubled separator leaves an empty middle one, so the segment check below refuses both whichever way this line is joined.',
      },
      {
        id: 'index:140:or-to-and#1',
        why: 'The scope-rule twin of the same redundancy. A rule that slips this disjunct is refused a few lines later as an unsafe scope rule instead of an invalid one - a different message for the same refusal.',
      },
    ],
  },
  {
    id: 'agent-broker',
    file: 'apps/service/src/agent-broker.js',
    why: 'The one place a grant is actually presented and an operation actually dispatched. capabilities.js decides; this is where the decision is obeyed.',
    tests: [
      'tooling/agent-capability-boundary.test.mjs',
    ],
    equivalent: [
      {
        id: 'agent-broker:213:false-to-true#1',
        why: 'The decision entry for a caller whose grant did not verify is built and then dropped: it has no project to be filed under, so nothing reads the field this changes. The refusal itself is the 403, which is asserted.',
      },
    ],
  },
  {
    id: 'risk-classification',
    file: 'packages/control-plane/src/risk.js',
    why: 'What buys adversarial review. Over-matching makes every styling change expensive; under-matching lets an auth change through on ordinary review.',
    tests: [
      'tooling/risk-classification.test.mjs',
    ],
    equivalent: [
      {
        id: 'risk:92:gte-widened#1',
        why: 'The comparison only differs when the two ranks are equal, and equal ranks mean the same index in the severity order, which means the same severity string. Whichever side is kept, the value kept is identical.',
      },
      {
        id: 'risk:111:gt-widened#1',
        why: 'The same identity in the reduce that picks the highest severity: widening it only changes which of two equal ranks is carried forward, and two equal ranks are one severity.',
      },
    ],
  },
  {
    id: 'data-change',
    file: 'packages/control-plane/src/data-change.js',
    why: 'Stage Q12 production data-change refusals: destructive classification, environment identity, recovery evidence and approval.',
    tests: [
      'tooling/data-change-safety.test.mjs',
      'tooling/data-recovery.test.mjs',
    ],
    equivalent: [
      {
        id: 'data-change:108:gt-widened#1',
        why: 'Widening the comparison only reassigns `worst` to a candidate of the same rank, which is the value it already held. The classification it produces is identical for every input.',
      },
      {
        id: 'data-change:140:lt-widened#1',
        why: 'One extra iteration past the end of the source reads an empty slice, which matches neither comment delimiter, advances the cursor and exits. The statement split is unchanged.',
      },
      {
        id: 'data-change:152:lt-widened#1',
        why: 'One extra iteration past the end of the source compares undefined against the quote character, advances and exits, and the slice that follows is clamped to the string length either way.',
      },
    ],
  },
]);
