# The first real model canary

One model, one low-risk role, one sandbox, one task, one bounded context packet,
one hard budget, one reviewed outcome. It runs **once** and stops.

Everything in `docs/AGENT_RUNTIME.md` up to this point is deliberately
provider-free: the attempt lifecycle, the capability boundary, the pinned image
and the egress profile can all be true with no credential anywhere in the
system. This lane is the smallest thing that stops that being true, and it is
built so that stopping it is easier than starting it.

It is **not** multi-agent orchestration, a background loop, a research agent, a
deployment agent or a worker pool. It promotes no role. Nothing in it runs on a
schedule.

---

## 1. Why `code-reviewer`

`docs/AGENT_RUNTIME.md` suggested `frontend-implementation` for the first
attempt. This lane deliberately takes a safer one.

| | `code-reviewer` | `frontend-implementation` |
|---|---|---|
| network profile | `none` | `none` |
| mutation scopes | **none** | `src/**`, `app/**`, `public/**` |
| projected capabilities | 14, **every one a read** | includes `project.overrides.write`, `project.generate` |
| output | `ReviewVerdict` — real JSON Schema at `schemas/review-verdict.schema.json` | a ChangeSet of files; acceptance needs a build |
| existing coverage | already the reader role in `npm run runtime:canary` | writer scenario only |
| self-approval | reviewer; `reviewedBy: []` means a person judges it | creator |

The deciding argument is the second row. A first real model attempt that can
write files is a first real model attempt that can be wrong in a way somebody
has to clean up. `code-reviewer` cannot: its capability projection is checked at
the broker and contains no mutating operation, and
`tooling/model-execution-doctor.mjs` fails the build if that ever changes.

The role was **not** altered to make the canary easy. It is used exactly as the
registry already declares it.

Ruled out for the first attempt: anything on `network.public` (`research`,
`planner`, `visual-critic` — the canary must not also be the first egress test),
anything on the `release` policy (`ship-release`, `environment-guardian` carry
`deploy.preview`), and every creator role with a mutation scope.

---

## 2. Where the model lives, and why it is not a Factory capability

The obvious design is to add `model.complete` to
`config/agent-capabilities.json` and let the broker dispatch it. That is wrong
here, and the repository already says so: every entry in that registry must name
a real Factory HTTP operation in `apps/service/src/tool-contract.js`, asserted by
`tooling/agent-capability-boundary.test.mjs`. Making model invocation a Factory
capability would put it on the Factory's own surface.

So the model lane is a **second trusted gateway on its own Unix socket**,
mounted into the attempt only when the lane is explicitly enabled:

```text
                      trusted side                    |  untrusted sandbox
                                                      |
  operator decision (signed, single-use)              |
  kill switch (two keys, both off by default)         |
        |                                             |
  model gateway  ── holds the credential ────────────►|  /run/app-builder/model.sock
        |                                             |
  provider adapter ── one HTTPS request ──────────────|
                                                      |
  capability broker ─────────────────────────────────►|  /run/app-builder/broker.sock
                                                      |
                                                      |  network profile: none
```

Two properties follow, and both are tested:

- **No role's Factory reach changes.** `capabilitiesForRole` is untouched, so
  all 38 role projections are byte-identical to before this lane existed.
- **An attempt with no model lane is identical to one from before the lane
  existed** — same mounts, same environment allow-list, same everything. There
  is nothing in such a sandbox to reach a model with.

---

## 3. The credential

The provider key is resolved inside the gateway process and nowhere else.

It does not reach: the sandbox environment, the sandbox filesystem, process
argv, the attempt record, the context packet, the event ledger, doctor or status
output, generated projects, or this repository.

The durable contract is `{ providerId, secretRef, configured }` — the same shape
`FactoryService.integrationStatus()` already uses for Netlify, Supabase, OpenAI
and Anthropic. `describeProviderSecret` refuses a `secretRef` that looks like a
credential rather than a name, so the field cannot quietly become the value.

Proved by:

- `no-provider-credential-in-sandbox` — the worker enumerates its own
  environment for credential-shaped names and reports them; trusted code grades
  the result;
- `model-lane-is-a-socket-and-nothing-else` — the sandbox may see a socket path
  and *no* provider identity: no endpoint, no model name, no key path;
- `no-credential-in-the-event-ledger` — the serialised ledger is searched for
  credential shapes;
- a test that serialises the whole run report and the durable record and asserts
  neither contains the credential, the grant signing key or the decision signing
  key;
- `assertNoProviderSessionIdentity`, which refuses a durable record carrying a
  provider session id or any credential-shaped key, recursively.

If the credential is absent the lane fails closed with
`provider-secret-missing`, named, before any transport is touched.

---

## 4. The kill switch

Two files. **Both** must say enabled. Default off in both.

| | who changes it | why it exists |
|---|---|---|
| `config/model-execution.json` | a reviewed merge | a lane cannot be enabled by editing a file on a box nobody reviewed |
| `/etc/app-builder/model-execution.json` | the operator, in a second | a lane can be stopped without waiting for a merge, and a host that never opted in cannot be started by someone else's commit |

Neither overrides the other, in either direction. Missing, unreadable, malformed
or wrong-shaped all read as **off**.

It is **not** `runtimeReady`. That flag answers "has this role been proven?";
this switch answers "may the factory spend money on a model right now?". A
proven role with the switch off makes no calls, and flipping the switch proves
nothing about any role. `model-execution-doctor.mjs` fails if the two are ever
merged into one flag.

**Semantics for an attempt already running:** it is terminated. The switch is
re-read immediately before *every* provider call, so the next call is refused;
and the canary supervisor polls the switch and cancels the attempt outright when
it goes off, so the sandbox goes away rather than merely stopping being able to
spend. Both guards are proved separately, because which one fires first is a
matter of timing rather than of design.

Nothing can bypass it: there is no scheduler in this lane, and the doctor fails
the build if a workflow or a `cron`/`watch`/`loop` script ever invokes the
canary.

---

## 5. The one-time enable decision

```bash
npm run runtime:model-canary -- --authorise --by "your name" --reason "first canary"
```

Writes a signed, single-use decision recording who authorised it, why, the role,
the project, the task, the canary id, the environment, the adapter, the provider,
the model, whether mutation is permitted (`false`), every budget ceiling, the
price it was authorised at, and an expiry.

`maxAttempts` is `1` and is not configurable. A decision that could authorise a
second attempt is a standing permission wearing a decision's clothes. The
decision id is marked spent **on dispatch**, not on success: a call that failed
has still been made.

`production` is refused outright as an environment.

Tampering with the decision — widening its budget, changing its role — fails
signature verification, exactly like a forged capability grant.

---

## 6. The hard budget

One call. 1500 output tokens. 30,000 total tokens. **£0.05.** Five minutes.

Enforcement never depends on the model choosing to stop:

- **before** the call, the lane refuses a request whose declared output ceiling
  exceeds what remains, at the price the decision was authorised at;
- **after** the call, usage is reconciled from the provider's own token counts;
- a response carrying **no** usage is `usage-unreconcilable` — refused, not
  recorded as free;
- the call, token and cost ceilings each bind independently.

The canary makes a deliberate second call so that "the budget stopped it" is
proved by a refusal to a call that was genuinely attempted, rather than by
nobody trying.

---

## 7. The task, and what counts as acceptance

`code-reviewer` reads a bounded packet through the broker and independently
reviews one ChangeSet against five named criteria, returning a `ReviewVerdict`.

The ChangeSet has **two deliberate, checkable defects**: a declared file outside
its own `allowedFiles` scope, and no rollback. `deterministicCriteriaOutcome`
settles all five criteria in code, without a model.

So acceptance is not "the model returned some text". It is:

- the answer parses as a JSON object;
- it carries every field the `ReviewVerdict` contract requires;
- its verdict is one the contract names;
- it names the artifact it was asked about;
- **it does not list itself among the authors** — the self-approval rule,
  checked on the artifact;
- **it names exactly the two criteria that genuinely fail** — not more, not
  fewer;
- its overall verdict follows from its own findings.

A confident, fluent, wrong verdict fails the run. There is a test that asserts
precisely that.

---

## 8. Running it

### Preflight — the default, and the one that matters

```bash
npm run runtime:model-canary
```

Changes nothing, calls nothing. Reports **every** outstanding prerequisite at
once — image digest, image on host, hosted boundary attestation, credential,
both kill switches, signing keys, enable decision, role eligibility — each with
its remedy. You should never discover the next prerequisite by running into it.

`HOST` entries are questions only the Hetzner host can settle. They are **not**
passes, and a run is refused while any remains.

### The host prerequisites, in order

```bash
# 1. Build the pinned task image and read its immutable digest.
sudo bash ops/hetzner/build-task-image.sh
sudo -u appbuilder podman image inspect localhost/app-builder-task:baseline-1 \
  --format '{{.Digest}}'

# 2. Record that digest in config/task-images.json through a reviewed change.
#    Do not invent one; a null digest is refused with the build command, and
#    that refusal is the feature.

# 3. Re-run the hosted boundary proof with that image present.
sudo bash ops/hetzner/verify-agent-boundary.sh

# 4. Signing keys, in the gateway's environment only.
export APP_BUILDER_AGENT_GRANT_SECRET="$(head -c 48 /dev/urandom | base64)"
export APP_BUILDER_MODEL_DECISION_SECRET="$(head -c 48 /dev/urandom | base64)"

# 5. The provider credential, in the gateway's environment only.
export ANTHROPIC_API_KEY=...

# 6. Both halves of the kill switch.
#    Repository: set enabled: true in config/model-execution.json, reviewed.
echo '{"enabled": true}' | sudo tee /etc/app-builder/model-execution.json

# 7. The one-time decision.
npm run runtime:model-canary -- --authorise --by "your name" --reason "first canary"
```

### The run

```bash
npm run runtime:model-canary -- --run
```

Runs the preflight again first and refuses to make a real call while anything is
outstanding. Writes a structured record to
`.app-builder/model-attempt-<id>.json`.

### The review

The attempt cannot promote itself.

```bash
npm run runtime:model-canary -- --review \
  --record .app-builder/model-attempt-<id>.json \
  --reviewer "your name" --verdict pass --rationale "why"
```

`recordReviewerVerdict` refuses a reviewer equal to the role that produced the
artifact. `modelAttemptEvidenceStatus` treats a record with no verdict, a
`rework-required` verdict, no provider call, a truncated call, a failed
deterministic check, or no artifact as **not** satisfying
`model-attempt-evidence`. Exit code zero is not evidence.

---

## 9. What promotion still requires afterwards

A green canary is not a promoted role, and this lane cannot promote one.

`config/runtime-readiness.json` requires eight things. A reviewed canary
satisfies exactly one of them — `model-attempt-evidence` — for exactly one role.
Promotion is a **separate**, reviewed change that records evidence for all eight
and flips one flag. `packages/control-plane/src/runtime-readiness.js` refuses a
promotion whose evidence does not resolve, and
`tooling/runtime-doctor.mjs` fails the build on a role that claims readiness it
has not earned.

Do not combine "the infrastructure exists" with "the role is proven" into one
claim. They are different sentences and they need different reviews.

---

## 10. What CI proves, and what only the host proves

**CI proves** the contracts, every refusal, the budget arithmetic, the sandbox
shape, the grading and the harness — with a stub provider, no credential and no
network. A green CI run means the boundary holds *by construction*. It does not
mean a model has ever been called.

**Only the Hetzner host proves** the built task image's identity, that the image
is present, the host runtime, the boundary under rootless Podman with that
image, and a real provider call on that host.

A local or CI image is not evidence of hosted identity, and this lane does not
report a skipped proof as green.

## 11. Adding a free provider, and earning a role with it

Section 8 is the Anthropic lane. This is the same ladder for a free provider,
and the ladder is the point: **a key is not readiness.** A provider goes

```text
configured → reachable → fixed canary → typed output valid
→ compared against declared criteria → reviewed → eligible for one role
```

and it earns only the role it was actually tested on. Passing a code-review
canary earns `code-reviewer` on synthetic material for that exact provider and
model. It earns nothing for implementation, architecture, security or another
model from the same vendor.

### Where the state lives

| Thing | Where | Changed by |
| --- | --- | --- |
| Which providers exist and what they may receive | `config/provider-profiles.json` | a reviewed merge |
| Whether any provider call may happen | `config/model-execution.json` **and** `/etc/app-builder/model-execution.json` | a reviewed merge, and the operator |
| The credential | the gateway process environment, for one run | the operator, on the host |

The credential is never in the repository, never in a committed `.env`, never in
an attempt record and never in a copyback. `config/provider-profiles.json`
records a `secretRef` — the *name* of a variable — and the trusted gateway is
the only thing that resolves it.

### Check first, before touching anything

```bash
npm run providers:doctor
```

Reports adapter, pinned model, whether each `secretRef` resolves, permitted data
classes, canary state and earned roles. It contacts no provider, so it costs
nothing and works with no credentials.

### Add a key — typed directly on the Hetzner shell

Type this on the host yourself. Do not paste a key into Claude, Codex, ChatGPT,
a GitHub issue, or any file in the repository.

```bash
# In the shell that will run the canary, and nowhere else.
# Note the leading space: it keeps the line out of shell history.
 export GROQ_API_KEY=<PASTE_KEY_LOCALLY_HERE>

# Confirm it resolved, without printing it.
npm run providers:doctor | grep -A1 '^  groq'
```

If the shell does not honour a leading space, `unset HISTFILE` for that session
instead. Either way the variable dies with the shell, which is the intended
lifetime: a provider credential that outlives the run it authorised is a
credential nobody is watching.

### Run the canary against the synthetic fixture

`examples/provider-canary/flawed-cart.js` is a deliberately flawed shopping-cart
helper invented for this purpose. It contains no App Builder source, no customer
material and no private business fact, which is what makes it safe to send to a
provider approved only for `synthetic` data. Its four defects and the scoring
rules are declared in `expected-findings.json` **before** any provider sees it —
criteria written after reading the answer would measure nothing.

Do not repair the fixture. Repairing it destroys the measurement.

The canary is the same one-time, single-use, budgeted decision as section 8: the
kill switch must be on at both halves, and the run needs an authorised decision
naming Groq, the OpenAI-compatible adapter, the pinned model, role, task and
ceilings. The provider is explicit in both commands; omitting it selects the
older Anthropic canary and an Anthropic decision or adapter cannot service a
Groq run. There is no fallback from this measurement. A `free-only` profile
refuses to become a billable call, so a quota or billing response fails rather
than spends, and no retry is made.

The exact operator sequence for the first Groq run is:

```bash
# 1. Non-networked status. This reports presence only and prints no key.
npm run providers:doctor

# 2. In this temporary Hetzner shell only. Type the value locally.
 export GROQ_API_KEY=<PASTE_KEY_LOCALLY_HERE>
export APP_BUILDER_AGENT_GRANT_SECRET="$(head -c 48 /dev/urandom | base64)"
export APP_BUILDER_MODEL_DECISION_SECRET="$(head -c 48 /dev/urandom | base64)"

# 3. Through a reviewed change, set config/model-execution.json enabled: true.
#    Then opt this host in independently.
echo '{"enabled": true}' | sudo tee /etc/app-builder/model-execution.json

# 4. Confirm every prerequisite. This makes no provider call.
npm run runtime:model-canary -- --provider groq

# 5. Mint one signed decision, explicitly for Groq.
npm run runtime:model-canary -- --provider groq --authorise \
  --by "your name" --reason "first Groq synthetic canary"

# 6. Make exactly one real request against the fixed flawed-cart fixture.
npm run runtime:model-canary -- --provider groq --run

# 7. A human who did not create the artifact reviews the recorded evidence.
npm run runtime:model-canary -- --review \
  --record .app-builder/model-attempt-<id>.json \
  --reviewer "your name" --verdict pass --rationale "why"

# 8. Stop both halves and remove the temporary credentials.
echo '{"enabled": false}' | sudo tee /etc/app-builder/model-execution.json
unset GROQ_API_KEY APP_BUILDER_AGENT_GRANT_SECRET APP_BUILDER_MODEL_DECISION_SECRET
```

Return `config/model-execution.json` to `enabled: false` in the reviewed change
that follows the run. Even a passing, human-reviewed record changes no provider
profile: `ready`, `eligibleRoles`, `highRiskRolesApproved` and data policy move
only in a later provider-promotion pull request.

### Recording what was earned

A passing canary is evidence, and evidence is what moves `ready` and
`eligibleRoles` in `config/provider-profiles.json` — through a reviewed change,
never a runtime toggle. `model-execution-doctor.mjs` fails the build if a
profile arrives with a role or a readiness flag it has not earned.

High-risk roles are not reachable this way at all. Security, release promotion,
destructive-change review, architecture sign-off and visual promotion need the
role in `highRiskRolesApproved` as well, which is a separate deliberate line.
One canary against a synthetic fixture is not evidence for any of them.

### The order to do this in

1. **Groq first.** It publishes explicit free-plan limits and returns a standard
   429, so it exercises the fallback path rather than only the happy one.
2. **Gemini second**, with the same fixture, keeping its
   public/synthetic/sanitised restriction — Free Tier data may be used to
   improve Google's products, which is why that restriction is recorded in the
   profile rather than inferred.
3. **OpenRouter last, and only pinned.** Its `modelId` is deliberately null: the
   data policy that matters is the underlying provider's, and `openrouter/free`
   names none. Pin a model and a provider before selecting it for anything.
