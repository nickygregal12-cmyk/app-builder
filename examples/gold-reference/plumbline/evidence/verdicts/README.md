# Plumbline — independent review record

Reviewed by Codex (OpenAI) against the nine criteria in the repository's visual gate, with
no sight of the implementation, the brief's intent, or any earlier verdict. The gate is
mean ≥ 8.5 and every criterion ≥ 6.5.

| rev | mean | floor | verdict |
|-----|------|-------|---------|
| v3  | 8.667 | 8.0 | pass |
| v6  | **8.667** | **8.0** | **pass** |

It passed on the first review, which neither of the other two prototypes did. The v3 → v6
changes fixed defects the reviewer named rather than chasing the number, and the number did
not move — which is the honest outcome when a pass is already comfortable.

Three of the v3 defects were real bugs rather than matters of taste:

- **The header button failed contrast.** `.bar nav a` is specificity (0,1,2) and `.ask` is
  (0,1,0), so the nav rule repainted the primary action's label in `--ink-soft` on an
  `--ink` ground. The reviewer described it as looking disabled. It was.
- **The mobile lock bar collapsed to a stub.** Grid places items in `order` sequence, so the
  track — ordered first — took the `auto` column and the figure took the `1fr`.
- **An unsupported claim.** The figure caption called the plan "a real plan for a real
  migration". The company is fictional and so is the plan; the wording now says what it is.

The invented figures and testimonial are also now qualified in the page next to where they
appear, rather than only in the footer.

## What is not fixed, and why

The reviewer would like an intermediate conversion prompt inside the long technical stretches
on /checks and /security, and finds the mobile checks list dense. Both are fair. They are
recorded rather than acted on because the prototype has passed and the remaining budget is
better spent on the corpus deliverables than on a fourth revision of a passing page.
