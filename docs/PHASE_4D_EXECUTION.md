# Phase 4D — Visual Direction, Responsive Composition and Candidate Promotion

Status: **✅ Complete — 2026-08-26**

Phase 4D proved that one approved product/content truth can produce genuinely different visual answers, be reviewed on comparable browser evidence, and promote exactly one answer into ordinary durable project state without weakening provenance, rights or portability.

The machine-readable delivery authority is `config/factory-status.json`. This file is now a historical execution/acceptance record, not a current roadmap.

## What shipped

The completed flow is:

```text
same approved product/content truth
  -> asset readiness
     -> 2+ structurally different visual directions
        -> responsive implementations
           -> DesignLint
              -> comparable RenderedEvidence
                 -> independent visual verdict
                    -> exactly one promoted design choice
                       -> ordinary standalone generated repository
```

Delivered slices:

- **4D.1** — visual promotion contract and DesignLint promotion semantics;
- **4D.4** — visual asset readiness before direction selection;
- **4D.5** — `ResponsiveCompositionPlan` subordinate to `ArtDirectionPlan`;
- **4D.6** — structural visual directions and diversity gate;
- **4D.7** — comparable per-candidate browser evidence;
- **4D.8** — independent visual review executed on the genuine-business NBM candidate set;
- **4D.9** — exactly one candidate promoted and rebuilt as the ordinary project.

The candidate machinery lives primarily in `config/visual-directions.json`, `tooling/lib/visual-direction.mjs`, `tooling/lib/visual-candidates.mjs`, `apps/service/src/visual-candidates.js` and the `visual-candidate-set` contract family.

## Genuine-business decision

Business: **nbm Construction Cost Consultants**

Approved intake: `examples/genuine-business/nbm-approved-intake.v1.json`

Recorded independent verdict: `examples/genuine-business/nbm-visual-review-verdict.v1.json`

Reviewer: `chatgpt-independent-visual-review`. The reviewer did not create or materially modify either candidate.

The review was performed over the detached evidence bundle produced by the repository's visual-review workflow: the same six routes, desktop/tablet/mobile captures, failed enquiry state, frozen truth, responsive plan and deterministic findings for each candidate.

### Candidate outcomes

| Candidate | Verdict | Outcome | Reason |
| --- | --- | --- | --- |
| `candidate-structured-practice` | **PASS** | **PROMOTED** | Stronger professional credibility, coherent hierarchy, clear conversion path and a deliberate conversion-first mobile composition. The figure-index moment is restrained and appropriate to a quantity-surveying practice. |
| `candidate-editorial-authority` | **REWORK** | Rejected from this set | Stronger editorial character on desktop, but the 390px header/navigation is cramped and does not clear the `responsive-quality` criterion. |
| `immersive-lead` | refused before generation | not a candidate | No publishable photography was available, so an imagery-led direction would have been dishonest/incomplete. |

Both generated candidates were DesignLint clean before review: zero violations, zero warnings and zero recommendations.

The passing verdict is deliberately narrower than a boutique-agency-quality claim. It closes the Phase 4D decision mechanism on a real business; corpus-level visual quality and the later professional-output gate remain evidence to earn, not something this single decision proves.

## Executable promotion proof

The genuine-business acceptance runner supports `--verdicts` and replays the whole decision rather than trusting a hand-edited result:

```bash
npm run acceptance:visual-candidates -- \
  --verdicts examples/genuine-business/nbm-visual-review-verdict.v1.json
```

The successful run proves:

1. the approved NBM intake is replayed;
2. the product/content truth is frozen once;
3. the two eligible directions are regenerated;
4. both candidates are independently built and photographed;
5. deterministic promotion gates are clear;
6. the independent verdicts are recorded;
7. only `candidate-structured-practice` is promoted;
8. the sibling is closed rather than left as a competing project fork;
9. the promoted direction is written as an ordinary durable design choice;
10. the canonical project is rebuilt from that durable choice;
11. the rebuilt generated repository independently installs, checks and builds;
12. the generated repository has no `@app-builder/*` runtime dependency.

Detached review artifacts are published by `.github/workflows/visual-review-evidence.yml`. The workflow uploads only `report.json`, `review-packets.json` and captured PNGs; it deliberately excludes workspaces, SQLite state and raw Factory/source state.

## Exit gate

All Phase 4D exit clauses are now satisfied:

1. **At least two genuinely different directions from one truth** — yes.
2. **Structural differences rather than theme swaps** — yes; diversity is checked independently of tokens.
3. **Real responsive implementations** — yes.
4. **Every executable declaration has a consumer** — yes; held by focused behavioural tests.
5. **DesignLint participates in promotion** — yes.
6. **Deterministic violations block promotion** — yes.
7. **Visual judgement is scoped to subjective criteria** — yes; the independent verdict used the review packet criteria.
8. **Candidate evidence is comparable** — yes; same routes/viewports/states.
9. **Exactly one candidate can be promoted** — yes; Structured Practice was promoted.
10. **Rejected candidates do not become permanent forks** — yes.
11. **A real business demonstrates the whole flow** — yes; NBM.
12. **Promoted output remains standalone** — yes; independently install/check/build and no App Builder runtime dependency.
13. **Rights/provenance/factual boundaries remain intact** — yes; candidate transforms are presentation-only and imagery readiness refused the unsupported imagery-led path.
14. **No speculative design catalogue was built without a consumer** — yes.
15. **Independence is recorded honestly** — yes. No automated cross-provider runtime critic ran; the supplied independent review is recorded separately from that unexecuted future capability.

## Deliberately deferred

These remain deferred, not silently marked complete:

- **4C.6 — design-intelligence catalogue**: revive only when a real consumer needs reviewed pattern retrieval not answered by current deterministic config.
- **4D.2 — VisualReferenceAnalysis**: revive when a project supplies a screenshot, moodboard or approved design-reference URL and a real decision needs decomposed reference traits.
- **4D.3 — MessagingPlan**: revive when composition/art direction needs narrative information not already expressible in the existing provenance-aware composition.
- **visual comparison canvas**: revive only when the ordinary Console demonstrably cannot support a real comparison task.

The authoritative reviving conditions remain in `config/factory-status.json`.

## What comes next

Phase 4D is closed. The next active product task is **Phase 4.2 — prove a genuinely different static/content-oriented renderer**, evaluating Astro first while preserving the same Manifest/PageSpec/SectionSpec/design truth and standalone generated-repository boundary.
