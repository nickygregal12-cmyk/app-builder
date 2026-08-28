# Test execution guide

This is a **navigation aid for fresh engineering sessions**, not a second quality authority.

- `docs/ENGINEERING_QUALITY_PROGRAMME.md` owns what deterministic gates mean, their ordering and what they prove.
- `package.json` owns the current local command surface.
- `.github/workflows/ci.yml` owns the hosted CI lanes and their real environment.
- `config/factory-status.json` owns current stage/status; `docs/ROADMAP.md` owns sequencing.

If this guide disagrees with any of those, fix this guide. Do not preserve the disagreement.

## 1. Start narrow — and establish live state

Before running a large suite, establish the task and the smallest proof that can answer it.

```bash
pwd
git status --short --branch
git rev-parse HEAD
npm run agent:route -- "THE TASK"
```

Then read `config/factory-status.json`, the one authority selected by `AGENTS.md`, and the affected source plus its tests.

A fresh session should normally **not** begin with `npm run check`. The full check is convergence evidence after the defect is understood; it is a poor diagnostic tool for discovering which of many independent contracts the task actually touches.

### Treat copybacks as leads, not live repository state

A copyback is evidence about what an earlier session observed. It may already be stale if another PR merged, the branch rebased, CI was rerun or the author pushed a fix after writing it.

Before continuing another agent's work, establish the live facts from Git/GitHub:

```text
current origin/main
current PR base SHA
current PR head SHA
changed files on that head
workflow/check runs attached to that exact head
```

If a copyback says `head=A` and GitHub says `head=B`, reason from `B`. Do not ask the previous narrative to overrule the repository.

Likewise, a green check attached to `A` is not evidence for `B`. The final merge decision uses the current head only.

## 2. The test ladder

Use the cheapest level that can falsify the change, then widen only after it passes.

| Change/question | Run first | Widen to |
| --- | --- | --- |
| One deterministic tooling module | `node --test tooling/<nearest>.test.mjs` | `npm test` |
| Architecture/import boundary | nearest boundary test | `npm run architecture` |
| Generated contract/schema/type drift | nearest contract test | `npm run contracts:check` then `npm run typecheck` |
| Unused/registered-but-unconsumed capability | nearest catalogue/composition test | `npm run orphans` |
| Design-token/CSS contract | nearest presentation/design test | `npm run lint:design-system` |
| Provider configuration or continuity | focused provider/model test | `npm run providers:doctor` |
| Runtime/control-plane change | focused runtime/control-plane test | `npm run runtime:doctor` and the relevant doctor |
| Generated application behaviour | relevant generated acceptance | appropriate Playwright lane |
| Accessibility behaviour | relevant functional journey first | `npm run test:e2e:accessibility` |
| Cross-browser portability | Chromium/functional proof first | `npm run test:e2e:portability` |
| Launch/readiness contract | nearest producer/consumer test | `npm run audit:launch` or `npm run gates:evidence` |
| Mutation-strength claim | test the safeguard normally first | `npm run mutation:strength` when that safeguard is in its mutation scope |
| Database/RLS boundary | closest deterministic SQL/security test available locally | hosted `database-security` lane when the faithful Supabase environment is required |

Do not turn this table into a command checklist. A task should run the rows it actually touches.

## 3. Converge in this order

Once the focused proof is green:

```text
focused test
→ affected subsystem gate/doctor
→ npm run check
→ npm run build
→ hosted CI for the exact head
```

`npm run check` currently composes the repository doctors, architecture, orphan detection, generated-contract drift, unit/contract tests, example validation, typecheck, lint and design-system lint. Do not duplicate those commands before it unless one is the focused diagnostic you needed.

`npm run build` is separate because a green source-level contract is not proof that the Console still builds.

## 4. Know what local cannot prove

A local approximation is not equivalent evidence merely because it is easier to run.

The hosted workflow currently has three independent lanes:

- **`verify`** — `npm run check`, build, canonical generated-app acceptance, browser journeys, accessibility and bounded portability evidence;
- **`mutation-strength`** — expensive proof that selected safeguards have tests capable of catching realistic breakage;
- **`database-security`** — disposable database/Supabase-backed evidence, including generated schema and tenant-security journeys.

Read `.github/workflows/ci.yml` before claiming a CI-only surface has been reproduced locally. If the hosted job deliberately runs a service or browser/runtime the current machine cannot run faithfully, record **CI-only** rather than substituting a weaker environment and calling it equivalent.

Likewise, a host-aware runtime check is not portable CI evidence. Commands under `ops/hetzner/` and host-aware canaries settle facts about that host; ordinary unit tests must remain runnable without host credentials or live provider calls.

### Integration proof is layered

For capabilities that cross a managed service boundary, keep the layers separate. A useful pattern is:

```text
contract/unit proof
→ database/policy proof
→ service/API proof
→ generated-product/browser proof
```

Each layer answers a different question.

For example, object-storage RLS can prove which rows/objects an identity may see or create, while the real Storage HTTP API may impose additional behaviour that direct SQL cannot reproduce, and the browser journey proves that the generated product actually uses that service correctly. A green database lane does **not** prove an API-boundary script, and a green API script does **not** prove the user journey.

When two layers deliberately use different environments, record which environment proved which fact instead of compressing them into one claim such as “storage tests passed”.

### Capability evidence matrix

A generated capability should carry only the proof its real boundaries require. Use this matrix to decide what is missing before inventing another harness.

| Capability shape | Contract/unit | Database/policy | Service/API | Browser/product | External-provider evidence |
| --- | --- | --- | --- | --- | --- |
| Pure UI/presentation | usually | no | no | yes | no |
| Tenant-owned database records | yes | **yes** | usually no | **yes** | no |
| Managed object storage | yes | **yes** where policy lives | **yes** where provider service adds behaviour | **yes** | no if local service is faithful |
| In-app notifications backed by the app database | yes | **yes** for tenant/user visibility | only if a separate service boundary exists | **yes** | no |
| Transactional email | yes | maybe, for durable send state/idempotency | **yes** for internal adapter boundary | **yes** for user-visible trigger/state | **yes**, bounded and non-CI, before claiming the adapter proven |
| Webhook send/receive | yes | maybe, for durable delivery state | **yes** | journey where the product consumes/exposes it | **yes** against a controlled endpoint/provider where needed |
| Background/queued job | yes | often, for durable job state | **yes** for executor/queue boundary | only for user-visible outcome | depends on executor/provider |
| Billing/payments | yes | **yes** for entitlement/reconciliation state | **yes** | **yes** for checkout/failure/recovery journeys | **yes** in provider sandbox/test mode |
| Model/provider runtime | yes | no unless durable state is involved | trusted gateway/adapter proof | no ordinary product browser requirement | **yes**, host-only bounded canary plus human review |

“Not needed” is a valid answer. The goal is not to fill every column; it is to avoid claiming a capability from evidence that never crossed the boundary the capability actually depends on.

## 5. Provider/model safety

Provider doctors and model-canary preflight are diagnostic and should make no provider call.

A real model attempt is different: it requires the repository and host switches, temporary trusted-side credentials/signing secrets and a signed one-use decision. Never turn a failing provider test into a live call just to see what happens. The authority is `docs/MODEL_CANARY.md`.

A provider response that is fluent or substantively correct can still fail its artifact contract. Keep protocol/structured-output validation, local schema validation and substantive deterministic grading separate; do not weaken one because another passed.

The first live-provider lesson is general: if a provider profile advertises a capability such as structured output, verify that the adapter **actually transmits and enforces** the corresponding contract. Metadata saying `structuredOutput: true` plus a prose instruction to “return JSON” is not structured-output enforcement. The local schema validator remains required even when the provider also constrains its output.

## 6. When a test fails

Work from the failing boundary inward:

1. Name the exact failing assertion/check and what it claims to prove.
2. Reproduce only that check if possible.
3. Identify the producer of the value and the consumer/gate that rejected it.
4. Check whether the failure is product code, the test harness, an environment mismatch, stale long-running process, or stale generated artifact before changing behaviour.
5. Fix the narrowest real defect.
6. Prove the test can fail for the intended defect when the gate is safety-critical; a passing suite that exercised nothing is not evidence.
7. Widen through the ladder above.

Do not respond to one red test by regenerating unrelated files, weakening a contract, removing a required field, broadening permissions or adding a retry/fallback unless the owning authority actually calls for that behaviour.

### Synced files do not reload a running process

A long-running service may still have pre-merge JavaScript in memory after its checkout is fast-forwarded. If source inspection says a failing behaviour was already removed but the running service still produces the old error, establish the process/revision boundary before editing code again.

For the protected Factory service on Hetzner, the safe diagnostic shape is:

```text
confirm protected checkout HEAD
→ confirm source contains the expected fix
→ check service health/state
→ controlled service restart when the application code changed
→ reproduce once against the restarted process
```

Do not make “restart everything” the default fix: restart only the service whose loaded application code changed, and do not use a restart to hide a reproducible defect. The lesson is simply that **repository state and process state are different facts**.

### Read the failing hosted step, not just the job colour

A red CI job can contain substantial green evidence before the failing step. Record the narrow boundary that failed.

For example:

```text
check/build/generation           PASS
service-specific acceptance      FAIL
later browser steps              SKIPPED
```

means “the service-specific acceptance is red”, not “the build is broken”. Fix and rerun the failing boundary first, then require the whole exact-head job to become green before merge.

## 7. Exact-head CI before merge

After the final push/rebase, previous green CI is stale evidence. The current head needs fresh hosted checks before merge, as required by `AGENTS.md`.

If `main` moved:

```text
fetch
→ rebase your own branch/worktree
→ rerun affected local checks
→ push
→ fresh exact-head CI
→ merge only that head
```

Never reset, clean, stash or switch another agent's worktree to make this easier.

## 8. Useful copyback from a test-heavy task

Keep the handoff small enough for the next fresh session to use:

- starting and ending SHA;
- exact defect/root cause;
- focused tests run and result;
- `npm run check` / build result when reached;
- anything **not** proved locally and why;
- exact-head hosted CI status;
- remaining failing check or next bounded action.

If the branch is still open, say so explicitly and distinguish **local success** from **hosted success**. If CI is red, name the exact failing job/step and which later steps were skipped. Do not write “CI failed” when the useful fact is “Storage API acceptance failed after check/build/benchmark passed”.

Do not paste hundreds of passing test names into status documents. The durable proof is the test/code/CI run; current state belongs in the machine-readable status only when the task actually changes programme state.
