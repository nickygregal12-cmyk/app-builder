import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function captureInventory(evidence) {
  return (evidence?.captures ?? []).map((capture) => ({
    id: capture.id,
    pageId: capture.pageId,
    route: capture.route,
    viewport: capture.viewport,
    state: { ...capture.state },
    file: capture.file,
    contentHash: capture.contentHash,
    byteSize: capture.byteSize,
    elementRefs: [...capture.elementRefs],
  }));
}

/**
 * A visual review somebody else can open.
 *
 * The first nbm review exposed this as a product problem rather than an
 * inconvenience. The evidence existed, the Console could show it, and the state
 * that made it viewable was a SQLite file and two workspace directories on one
 * machine. Handing the review to a second person meant handing them the
 * machine, and a review nobody else can reach is not an independent review; it
 * is a private one.
 *
 * So this writes a packet: one directory, no hidden state, every capture copied
 * in beside the record that explains it, and an index a browser opens from the
 * filesystem. It is deliberately not the Console — a packet is for archiving,
 * uploading to CI artifact storage and handing over, and it has to keep working
 * when the factory that made it is gone.
 *
 * What it carries is what a reviewer needs to answer the questions and nothing
 * that would make it a second source of truth: the frozen product truth every
 * candidate shares, each candidate's compiled plan, its DesignLint findings, its
 * captures, the scoped criteria, the declared bar, and whatever verdicts and
 * rework plans exist so far. It never goes into the generated repository, which
 * is a product, not a review record.
 */

const list = (value) => (Array.isArray(value) ? value : []);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function definition(entries) {
  return `<dl>${entries.map(([term, detail]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(detail)}</dd>`).join('')}</dl>`;
}

/**
 * The index page.
 *
 * Plain HTML with an inline stylesheet and no script, because the one thing it
 * has to do is open from a file:// URL on a machine that has never heard of this
 * repository.
 */
function renderIndex(packet) {
  const candidates = packet.candidates.map((candidate) => `
    <article>
      <h2>${escapeHtml(candidate.directionLabel)} <span class="gate gate-${escapeHtml(candidate.gate.status)}">${escapeHtml(candidate.gate.status)}</span></h2>
      <p class="id">${escapeHtml(candidate.candidateId)}${candidate.lineage ? ` · revision ${candidate.lineage.iteration} of ${escapeHtml(candidate.lineage.parentCandidateId)}` : ''}</p>
      ${candidate.purpose ? `<p>${escapeHtml(candidate.purpose)}</p>` : ''}
      ${definition(Object.entries(candidate.axes).map(([axis, value]) => [axis, value ?? '—']))}
      ${candidate.review ? `<p class="verdict"><strong>${escapeHtml(candidate.review.verdict)}</strong> by ${escapeHtml(candidate.review.reviewedBy)}${typeof candidate.review.overallScore === 'number' ? ` · ${candidate.review.overallScore}/10` : ''}${candidate.review.rationale ? ` — ${escapeHtml(candidate.review.rationale)}` : ''}</p>` : '<p class="verdict pending">No verdict yet.</p>'}
      ${candidate.designLint.length ? `<ul class="lint">${candidate.designLint.map((finding) => `<li><em>${escapeHtml(finding.severity)}</em> ${escapeHtml(finding.rule)} — ${escapeHtml(finding.detail)}</li>`).join('')}</ul>` : '<p class="lint-clean">DesignLint: nothing to report.</p>'}
      <div class="shots">${candidate.captures.map((capture) => `
        <figure>
          <img src="${escapeHtml(capture.file)}" alt="${escapeHtml(candidate.directionLabel)} at ${escapeHtml(capture.route)}, ${escapeHtml(capture.viewport)}, ${escapeHtml(capture.state.interaction ?? 'at rest')}" loading="lazy">
          <figcaption>${escapeHtml(capture.route)} · ${escapeHtml(capture.viewport)} · ${escapeHtml(capture.state.interaction ?? 'at rest')}</figcaption>
        </figure>`).join('')}</div>
    </article>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual review — ${escapeHtml(packet.business)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; padding: 32px 24px 96px; max-width: 1200px; font: 16px/1.6 system-ui, sans-serif; }
  h1 { font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 4px; }
  .lede { color: #666; margin: 0 0 28px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 12px 0; font-size: 0.86rem; }
  dt { color: #666; }
  dd { margin: 0; }
  article { border: 1px solid #ccc; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
  article h2 { font-size: 1.15rem; margin: 0 0 2px; display: flex; gap: 10px; align-items: center; }
  .id { margin: 0; font: 12px/1.4 ui-monospace, monospace; color: #777; }
  .gate { font-size: 0.62rem; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 7px; border-radius: 6px; background: #eee; }
  .gate-clear { background: #dff0e3; }
  .gate-review-required { background: #f6ecd2; }
  .gate-blocked { background: #f4dcd8; }
  .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px; }
  figure { margin: 0; }
  figure img { display: block; width: 100%; height: auto; max-height: 420px; object-fit: cover; object-position: top; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
  figcaption { font-size: 0.74rem; color: #666; padding-top: 4px; }
  ul.lint { margin: 10px 0; padding-left: 18px; font-size: 0.82rem; }
  .lint-clean, .verdict { font-size: 0.86rem; }
  .verdict.pending { color: #a06a10; }
  ol.criteria { font-size: 0.9rem; }
  footer { margin-top: 36px; color: #666; font-size: 0.8rem; }
</style>
</head>
<body>
  <h1>Visual review — ${escapeHtml(packet.business)}</h1>
  <p class="lede">${escapeHtml(packet.candidates.length)} candidate(s) over one frozen product truth. ${escapeHtml(packet.setOutcome === 'undecided' ? 'No decision recorded yet.' : `Set ${packet.setOutcome}.`)}</p>
  <h2>What every candidate shares</h2>
  ${definition([
    ['Set', packet.setId],
    ['Project type', packet.frozenTruth.projectType],
    ['Manifest', `v${packet.frozenTruth.manifestVersion} · ${packet.frozenTruth.manifestHash ?? 'unhashed'}`],
    ['Knowledge', packet.frozenTruth.knowledgePackHash ?? `none — ${packet.frozenTruth.knowledgeSource ?? 'approved manifest only'}`],
    ['Baseline composition', packet.frozenTruth.baselineCompositionHash],
    ['Imagery', packet.assetReadiness.strategyReason],
    ['Professional bar', packet.qualityGate?.minimumScore ? `${packet.qualityGate.minimumScore} overall, no criterion below ${packet.qualityGate.minimumCriterionScore}` : 'none declared'],
  ])}
  ${packet.designReferences.length ? `<h2>Design references this set was influenced by</h2>${definition(packet.designReferences.flatMap((reference) => [
    [reference.label, `use: ${reference.adopt.join(', ') || 'nothing'} · avoid: ${reference.avoid.join(', ') || 'nothing'}`],
  ]))}` : ''}
  ${packet.refusedDirections.length ? `<h2>Directions this project cannot present by</h2><ul>${packet.refusedDirections.map((entry) => `<li><strong>${escapeHtml(entry.directionId)}</strong> — ${escapeHtml(entry.detail)}</li>`).join('')}</ul>` : ''}
  <h2>Candidates</h2>
  ${candidates}
  <h2>What only judgement can settle</h2>
  <ol class="criteria">${packet.criteria.map((criterion) => `<li><strong>${escapeHtml(criterion.id)}</strong> — ${escapeHtml(criterion.question)}</li>`).join('')}</ol>
  ${packet.reworkPlans.length ? `<h2>Rework asked for</h2><ul>${packet.reworkPlans.map((plan) => `<li><strong>${escapeHtml(plan.parentCandidateId)}</strong> pass ${plan.iteration}: failed ${escapeHtml(plan.failingCriteria.join(', '))}; ${plan.targets.length ? escapeHtml(plan.targets.map((target) => `${target.axis} ${target.from} → ${target.to}`).join(', ')) : 'no axis change available'}${plan.customPresentation ? ` — needs a bespoke presentation: ${escapeHtml(plan.customPresentation.artDirectionNeed)}` : ''}</li>`).join('')}</ul>` : ''}
  <footer>
    Generated by App Builder. Everything here is a copy: no factory database, workspace or running service is needed to read it.
    The captures are of builds the factory made; nothing in this packet is publishable material belonging to anyone else.
  </footer>
</body>
</html>
`;
}

/**
 * Write the packet.
 *
 * `readEvidence` and `readCapture` are injected so this stays a pure assembler:
 * it does not know where the factory keeps its evidence, and a test does not
 * need a factory to prove the packet carries what it claims.
 */
export function writeVisualReviewPacket({ outputDir, business, set, criteria, qualityGate = null, designReferences = [], readEvidence, readCapture }) {
  if (!outputDir) throw new Error('A visual review packet needs somewhere to be written.');
  if (!set?.setId) throw new Error('A visual review packet is written from a candidate set.');
  const root = path.resolve(outputDir);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'captures'), { recursive: true });

  const candidates = list(set.candidates).map((candidate) => {
    const evidence = candidate.evidenceId ? readEvidence(candidate.evidenceId) : null;
    const captures = captureInventory(evidence).map((capture) => {
      const bytes = readCapture(candidate.evidenceId, capture.id);
      // A packet that references a capture it did not copy is the local-only
      // problem again, one directory deeper.
      if (!bytes) return null;
      const file = `captures/${candidate.candidateId}-${capture.id}.png`;
      fs.writeFileSync(path.join(root, file), bytes);
      return { ...capture, file, sha256: sha256(bytes) };
    }).filter(Boolean);
    return {
      candidateId: candidate.candidateId,
      directionId: candidate.directionId,
      directionLabel: candidate.directionLabel,
      purpose: candidate.purpose ?? null,
      state: candidate.state,
      outcome: candidate.outcome,
      iteration: candidate.iteration ?? 0,
      lineage: candidate.lineage ?? null,
      axes: candidate.signature?.axes ?? {},
      responsive: candidate.artDirection?.responsive ?? {},
      referenceAnalysisIds: list(candidate.referenceAnalysisIds),
      compositionHash: candidate.compositionHash,
      gate: candidate.gate,
      designLint: list(candidate.designLint?.findings),
      review: candidate.review ?? null,
      captures,
    };
  });

  const packet = {
    schemaVersion: 1,
    business,
    setId: set.setId,
    projectId: set.projectId,
    createdAt: set.createdAt,
    setOutcome: set.setOutcome ?? 'undecided',
    decision: set.decision ?? null,
    frozenTruth: set.frozenTruth,
    assetReadiness: set.assetReadiness,
    diversity: set.diversity,
    refusedDirections: list(set.refusedDirections),
    reworkPlans: list(set.reworkPlans),
    qualityGate,
    criteria: list(criteria),
    designReferences: list(designReferences),
    candidates,
    promotedCandidateId: set.promotedCandidateId ?? null,
  };

  fs.writeFileSync(path.join(root, 'review.json'), `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'index.html'), renderIndex(packet));
  return {
    root,
    packet,
    files: ['review.json', 'index.html', ...candidates.flatMap((candidate) => candidate.captures.map((capture) => capture.file))],
    captureCount: candidates.reduce((total, candidate) => total + candidate.captures.length, 0),
  };
}
