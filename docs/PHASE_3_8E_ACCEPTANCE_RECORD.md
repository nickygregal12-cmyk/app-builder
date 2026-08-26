# Phase 3.8E Acceptance Record

Status: **passed** on 2026-08-26.

This record freezes the evidence that closed the genuine-business product-proof gate. It does not replace `schemas/genuine-business-acceptance.schema.json` or `docs/GENUINE_BUSINESS_ACCEPTANCE.md`; it records the actual accepted run so later planning cannot quietly reinterpret it.

## Business and run

- Business: nbm Construction Cost Consultants
- Public website: `https://www.nbm.bz/`
- Approved intake baseline: `examples/genuine-business/nbm-approved-intake.v1.json`
- Generated project id: `project-7b296c17-4745-422a-a1f4-23dafb160c98`
- Accepted generated workspace: source-backed v2 build
- Factory commit used for the run: `a34f0d8458425527db8695a14d231cad786e623f`

The committed intake is the explicitly versioned replacement baseline documented by the genuine-business fixture. It is not presented as a reconstruction of the original lost intake.

## Machine evidence

The final run completed the genuine journey through the Factory rather than through an out-of-band substitute:

1. replay approved intake;
2. ingest real company material;
3. derive trusted knowledge pack;
4. compose;
5. generate a new source-backed workspace;
6. verify;
7. start the supported service-managed preview;
8. capture rendered evidence;
9. run launch-readiness audit;
10. assemble the review packet;
11. validate the completed human-reviewed evidence.

The Factory runtime ingested:

- the owner-approved NBM workbook as `user-supplied` / `approved-for-use`; and
- eight pages from the real NBM public website as `existing-site` / `reference-only`.

The accepted knowledge pack therefore contained 9 hashed sources. The public website was not merely named in the evidence file: each declared website source was cross-checked against a `contentHash` in the knowledge pack produced by the actual crawl.

Rendered evidence was captured from the supported preview across desktop, tablet and mobile, including interaction-state evidence where the build exposed those states.

Launch readiness at handover recorded:

- predicted meaningful edits: **6**;
- blockers: **0**;
- evidence gaps: **14**.

The evidence gaps are retained as evidence limitations, not rewritten as passed visual states.

## Human product review

The project owner reviewed the source-backed v2 build in the Builder Console and passed:

- factual accuracy;
- brand fit;
- visual quality;
- responsive quality;
- accessibility;
- launchability.

Meaningful manual edits required before the reviewer considered the build launchable: **0**.

That is below the Phase 3.8E threshold of fewer than 20 meaningful manual edits. The deterministic launch-readiness audit over-predicted by 6 edits; that delta is useful future calibration evidence rather than a reason to rewrite the human review.

The final validator output was:

```text
Genuine business acceptance passed: nbm Construction Cost Consultants
Meaningful manual edits: 0/19 allowed
Launch readiness at handover: 6 predicted edit(s), 0 blocker(s), 14 evidence gap(s)
Prediction accuracy: the audit over-predicted by 6 edit(s) — those checks may be too eager.
```

Final `evidence.json` SHA-256:

```text
a3b3baf5e67c0cb369da6f6329da3088e8eb8df4d27e1e13497ff8b7bccee990
```

The full packet remains a host-side acceptance artifact under `/srv/app-builder/artifacts/nbm-3.8e-final`; it is not committed wholesale into the product repository because it contains generated repository/evidence material rather than factory source.

## Findings carried forward

### Evidence-browser provisioning

The first rendered-evidence capture attempt failed on the Hetzner host even though generation, verification and preview were healthy. The missing piece was the Playwright Chromium browser for the `appbuilder` service user. Installing Chromium for that isolated user allowed the same build to capture evidence successfully without regeneration.

This is a deployment/doctor gap worth fixing in a later bounded infrastructure change: any host that claims rendered-evidence capability should either provision the required browser or fail preflight with a precise instruction before a business run reaches the capture gate.

### Imagery calibration

The accepted NBM run intentionally had no publishable imagery from the public website because those assets were `reference-only`. The deterministic audit counted the resulting imagery opportunities as six predicted edits; the human reviewer considered the result launchable without making those edits. Phase 4C/4D quality work should use this as calibration evidence rather than weakening rights governance.

## Gate decision

**Phase 3.8E is complete. Phase 4C is unblocked.**

This decision does not unlock broad autonomous runtime permissions. The runtime-to-factory capability boundary remains a separate hardening concern and must stay gated on its own workstream.
