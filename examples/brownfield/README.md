# Brownfield adoption evidence

The first real-repository result from the read-only profiler
(`tooling/lib/brownfield-profile.mjs`), and the baseline derived from it.

## Why the baseline is here and the profile is not

The baseline is 1.7 KB of identity and shape. The profile is 35 KB, most of it
lists of file paths belonging to another project, and it is reproducible from
the revision the baseline names:

```bash
npm run acceptance:brownfield -- --repo /path/to/Euro-2028-Predictor
```

Committing the full profile would put a snapshot of another repository's file
tree into this one, where it would drift and where nobody would notice. The
baseline is what a later comparison actually reads.

## euro-2028-predictor.baseline.v1.json

`nickygregal12-cmyk/Euro-2028-Predictor` at `9e88437`, read on 2026-08-28 from a
clean worktree. A mature repository nobody shaped for this profiler: 3263 files,
218 migrations, 67 CI workflows, 719 unit test files, 188 database tests.

**Zero mutations.** The acceptance fingerprints every path, size and mtime in
the working tree *and* in `.git` before and after, and both were unchanged. The
run took 89 ms.

### Verified by hand against source

Every count below was checked independently rather than believed:

| claim | profiler | independently counted |
| --- | --- | --- |
| migrations | 218 | 218 |
| database tests | 188 | 188 |
| CI workflows | 67 | 67 |
| SQL files declaring RLS or a policy | 69 | 69 |
| e2e test files | 55 | 55 |
| unit test files | 719 | 719 |
| Supabase edge functions | 3 | 3 (`_shared` has no entry point and is correctly not one) |
| package manager | npm | `package-lock.json` |
| build command | `tsc -b && vite build` | matches `package.json` |

The unit-test count found a real defect **in the profiler**, which is what a
mature repository is for. The first run reported 718 because the unit/e2e split
matched `e2e` anywhere in a path: it excluded
`tests/scripts/e2eProjectGating.test.ts` while keeping five sibling
`*E2E.test.ts` files, purely because the check was case-sensitive. Those files
are unit tests *about* end-to-end gating and run under the unit runner. The
split now matches a path segment, and the count agrees with an independent one.

### What it correctly refused to claim

Four fields are not established, and each is right to be:

- **`architecture.routeLocations` — unproven.** Predictor routes through
  `react-router` inside `src/App.tsx` and has no `pages/` or `routes/`
  directory. There was nothing to find, and inventing routes from source would
  have been the profile's first fabrication.
- **`stack.commands.typecheck` — unproven.** There is no `typecheck` script;
  the nearest is `generate:types`, which is a different thing.
- **`data.auth` — inferred, not demonstrated.** `@supabase/supabase-js` is a
  dependency. That proves the library is available and never that sessions,
  roles or access rules work.
- **`designSystem.uiPackages` — unproven.** No Tailwind, Radix, MUI or Chakra.
  Correct: Predictor's design system is its own.

`designSystem.assimilation` is `not-applicable` by declaration. Predictor has
`src/design-system/`, which is exactly the case where a profiler is tempted to
say it found the design system. A directory name is not evidence of one.

## What this baseline does not protect

Stated in the artifact itself, and worth repeating: nothing was executed. No
test result, build outcome, journey or rendered page is recorded here, and none
may be assumed to have passed. A count that did not move does not prove the
thing behind it is unchanged.

Mutation is a separate slice and has not been earned by this one.
