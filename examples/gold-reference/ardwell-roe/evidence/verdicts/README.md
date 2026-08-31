# Independent visual review — Ardwell & Roe

Both reviews were produced by an **OpenAI Codex CLI** reviewer over rendered screenshots.
Different vendor from the runtime that built the site, and it did not produce the work, which
is what `requiresIndependentReviewer` in `config/agent-pipelines.json` asks for. The nine
criteria are the repository's own, read from `tooling/lib/visual-candidates.mjs`, so these
numbers are directly comparable to the factory's.

The reviewer was told the business and the criteria. It was **not** told the site was a
benchmark, who built it, or that any result was hoped for.

| | v4 | v5 | gate |
| --- | ---: | ---: | ---: |
| mean | 8.47 | **8.71** | ≥ 8.5 |
| lowest criterion | 6.7 | **7.7** | ≥ 6.5 |
| brand-fit | 9.0 | 9.0 | |
| visual-hierarchy | 8.6 | 8.7 | |
| coherence | 8.8 | 9.0 | |
| **distinctiveness** | 8.4 | **8.8** | |
| credibility | 9.1 | 9.2 | |
| conversion-clarity | 6.7 | **7.7** | |
| imagery-suitability | 9.2 | 9.1 | |
| responsive-quality | 8.1 | 8.3 | |
| distinctive-moment | 8.3 | 8.6 | |

**v4 did not pass.** 8.47 is 0.03 short, and one round of rework was spent on the single major
defect the reviewer named — a recessive enquiry path. `reworkIterationBudget` for the visual
gate is 2; one was used.

## Against the factory

`docs/PHASE_4D_VISUAL_DEBT.md` records the factory's best over six independent reviews:
**6.70 mean, 4.7 floor, distinctiveness 5.4.** `distinctiveness` had read 4.3–4.8 through a
content fix, a moment contract, an axis-rendering fix, an entirely new direction and a whole
round of rhythm work, and moved only when the architecture changed.

Same business, same approved pack, same renderer (Astro 7.2.7), same system font stacks.

## Known limitations, not fixed

- **conversion-clarity, major, still open.** "The principal enquiry action disappears from the
  header and is absent through long stretches of project browsing." The header carries an
  Enquiries link but does not persist on scroll. Making it sticky would close this and would
  change the character of the page; it is recorded rather than done, because the rework budget
  is spent and quietly taking a third round is how a bounded loop stops being bounded.
- **responsive-quality, minor.** Metadata, statistics and footer detail are set small and dense
  at 390px.
- **visual-hierarchy, minor.** On the home sequence, project title and result statistic
  compete slightly for the first read.
- **distinctive-moment, minor.** "Memorable through restraint and execution more than through
  a uniquely ownable interaction." A fair criticism of a deliberately quiet direction.
