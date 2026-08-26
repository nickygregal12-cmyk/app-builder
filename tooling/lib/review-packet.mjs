import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Assemble everything a genuine-business acceptance run can prove about itself,
 * and say plainly what is left for a person.
 *
 * The acceptance contract requires a human product review and a counted list of
 * meaningful manual edits. Nothing here writes either: an agent that signs its
 * own review has not been reviewed. What this does is remove the hand-assembly
 * around them — the hashes, the source ledger, the journey record, the metrics
 * and the artifact copies — so the reviewer spends their attention on judgement
 * rather than on transcription, and so a draft cannot claim a crawl that never
 * happened.
 */

const EVIDENCE_SOURCE_KINDS = new Set(['website', 'document', 'logo', 'image', 'spreadsheet', 'other']);
const EVIDENCE_PROVENANCE = new Set(['user-supplied', 'existing-site', 'authorised-public']);
const EVIDENCE_RIGHTS = new Set(['approved-for-use', 'reference-only', 'unknown']);
const SUPPLIED_FILE_KINDS = new Set(['document', 'logo', 'image', 'spreadsheet']);

// A generated repository is evidence; the machinery around it is not.
const REPOSITORY_EXCLUDES = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage']);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return { path: file, sha256: sha256(fs.readFileSync(file)) };
}

function copyRepository(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (REPOSITORY_EXCLUDES.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyRepository(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

function sourceKind(source) {
  if (source.sourceChannel === 'website' || source.kind === 'url') return 'website';
  return EVIDENCE_SOURCE_KINDS.has(source.kind) ? source.kind : 'other';
}

function sourceProvenance(source) {
  if (EVIDENCE_PROVENANCE.has(source.provenance)) return source.provenance;
  return source.provenance === 'external-research' ? 'authorised-public' : 'user-supplied';
}

/**
 * The journey record comes from the durable event ledger, not from a claim.
 *
 * A stage that produced no event did not happen, and the packet says so rather
 * than writing `passed` because the operator remembers doing it.
 */
function journeysFrom({ events, intakeBundle, manifest, knowledgePack, composition }) {
  const seen = new Set(events.map((event) => event.type));
  const stages = {
    intake: Boolean(intakeBundle),
    buildContract: intakeBundle?.buildContract?.status === 'approved',
    manifest: Boolean(manifest),
    ingest: Boolean(knowledgePack),
    compose: Boolean(composition),
    generate: seen.has('build.succeeded'),
    verify: seen.has('quality.succeeded'),
    preview: seen.has('preview.started'),
  };
  const journeys = {};
  const unproven = [];
  for (const [stage, proven] of Object.entries(stages)) {
    if (proven) journeys[stage] = 'passed';
    else unproven.push(stage);
  }
  journeys.deploy = seen.has('deploy.succeeded') ? 'passed' : 'not-applicable';
  return { journeys, unproven };
}

/** The verification report the schema asks for, taken from what actually ran. */
function verificationReport(events) {
  const relevant = events.filter((event) => event.type.startsWith('quality.'));
  return {
    reportVersion: 1,
    steps: relevant.map((event) => ({
      type: event.type,
      timestamp: event.timestamp,
      durationMs: event.usage?.durationMs ?? 0,
      workspace: event.payload?.workspace ?? null,
      message: event.payload?.message ?? null,
    })),
    installed: relevant.some((event) => event.type === 'quality.install.succeeded'),
    checked: relevant.some((event) => event.type === 'quality.check.succeeded'),
    built: relevant.some((event) => event.type === 'quality.build.succeeded'),
    failures: relevant.filter((event) => event.type.endsWith('.failed')).length,
  };
}

/**
 * Collect the packet for one project.
 *
 * `missing` is the honest half of the return value: every machine-provable
 * thing the run cannot show, and every human field left deliberately empty.
 */
export function collectReviewPacket({ service, projectId, factoryCommit, outDir, now = new Date().toISOString() }) {
  const project = service.getProject(projectId);
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  const manifest = service.getManifest(projectId);
  const knowledgePack = service.getKnowledgePack(projectId);
  const composition = service.getComposition(projectId);
  const intakeBundle = service.getIntakeBundle(projectId);
  const events = service.listEvents(projectId);
  const tasks = service.listTasks(projectId);
  const evidenceSets = service.listRenderedEvidence(projectId);
  const metrics = service.metrics(projectId);
  const review = service.productReview(projectId);

  const missing = [];
  if (!knowledgePack) missing.push('No knowledge pack: nothing was ingested, so no source can be cross-checked.');
  if (!composition) missing.push('No composition: the project has not been generated.');
  if (!intakeBundle) missing.push('No approved intake bundle: this run cannot be replayed, and the intake journey cannot be evidenced.');
  if (!project.workspacePath) missing.push('No generated workspace: there is no repository to hand over.');
  if (!evidenceSets.length) missing.push('No rendered evidence: capture it before reviewing, so the review judges what the build actually rendered.');

  const { journeys, unproven } = journeysFrom({ events, intakeBundle, manifest, knowledgePack, composition });
  for (const stage of unproven) missing.push(`Journey "${stage}" has no durable evidence that it ran.`);

  const packSources = knowledgePack?.sources ?? [];
  const sources = packSources.map((source) => ({
    id: source.id,
    kind: sourceKind(source),
    label: source.label,
    uri: source.uri ?? source.label,
    sha256: source.contentHash,
    provenance: sourceProvenance(source),
    rightsStatus: EVIDENCE_RIGHTS.has(source.rightsStatus) ? source.rightsStatus : 'unknown',
  }));
  if (!sources.some((source) => source.kind === 'website')) {
    missing.push('No website source was ingested. The acceptance contract needs the real company site, crawled by the factory, not named in a file.');
  }
  if (!sources.some((source) => SUPPLIED_FILE_KINDS.has(source.kind) && source.provenance === 'user-supplied' && source.rightsStatus === 'approved-for-use')) {
    missing.push('No user-supplied file approved for use was ingested.');
  }

  const timestamps = events.map((event) => event.timestamp).filter(Boolean).sort();
  const failures = events.filter((event) => event.type.endsWith('.failed'));
  const attempts = tasks.reduce((total, task) => total + Math.max(0, (task.attempt ?? 1) - 1), 0);

  const evidence = {
    schemaVersion: 1,
    run: {
      id: `${project.slug}-${(timestamps[0] ?? now).replace(/[:.]/g, '-')}`,
      startedAt: timestamps[0] ?? project.createdAt,
      completedAt: timestamps[timestamps.length - 1] ?? project.updatedAt,
      factoryCommit,
    },
    business: {
      name: manifest?.company?.identity?.name || project.name,
      primaryUrl: manifest?.inputs?.existingWebsite || sources.find((source) => source.kind === 'website')?.uri || '',
      projectType: project.type,
      synthetic: false,
    },
    sources,
    journeys,
    metrics: {
      aiCalls: events.filter((event) => event.usage?.model).length,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      costGbp: metrics.costGbp,
      elapsedMs: metrics.durationMs,
      retries: attempts,
      interventions: metrics.interventions,
      qualityFailures: failures.filter((event) => event.type.startsWith('quality.')).length,
    },
    observedShortcomings: { brandAssets: [], genericDesign: [], imageGaps: [], copyMessaging: [], responsiveVisual: [], other: [] },
  };

  if (!evidence.business.primaryUrl) missing.push('No public company URL is recorded on the Manifest or in the ingested sources.');

  // Deliberately absent: `productReview` and `manualEdits`. The validator will
  // refuse the draft until a person supplies them, which is the point.
  const awaitingAPerson = [
    'productReview.reviewer — who actually looked at it',
    'productReview.notes — what they judged, in enough detail to be a judgement',
    'productReview.checks — factualAccuracy, brandFit, visualQuality, responsiveQuality, accessibility',
    'productReview.launchable — only true if it is',
    'manualEdits.entries — every meaningful edit, with its category',
    'manualEdits.total — the number of those entries',
    'observedShortcomings — what the build got wrong, by category',
  ];

  return { project, manifest, knowledgePack, composition, intakeBundle, evidenceSets, review, evidence, missing, awaitingAPerson, verification: verificationReport(events), outDir };
}

function suppliedOriginals(service, projectId, packet, outDir) {
  const notes = [];
  for (const source of packet.evidence.sources) {
    if (!SUPPLIED_FILE_KINDS.has(source.kind) || source.provenance !== 'user-supplied') continue;
    const retained = service.readRetainedSource?.(projectId, source.sha256) ?? null;
    if (!retained) {
      notes.push(`${source.id} (${source.label}): the factory did not retain the original bytes. Put the file you supplied at sources/${source.id} and check its SHA-256 is ${source.sha256}.`);
      continue;
    }
    const target = path.join(outDir, 'sources', retained.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, retained.bytes);
    source.uri = path.posix.join('sources', retained.name);
  }
  return notes;
}

/**
 * Put the pictures in the packet.
 *
 * A review of rendered evidence that needs a running factory to see the
 * renderings is not a packet anyone can take away and look at.
 */
function copyRenderedEvidence(service, projectId, packet, outDir) {
  const set = packet.evidenceSets.at(-1);
  if (!set) return null;
  const directory = path.join(outDir, 'rendered-evidence', set.id);
  fs.mkdirSync(directory, { recursive: true });
  const copied = [];
  for (const capture of set.captures) {
    const found = service.readRenderedCapture(projectId, set.id, capture.id);
    if (!found) continue;
    const target = path.join(directory, capture.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, found.bytes);
    copied.push({ capture, file: path.posix.join('rendered-evidence', set.id, capture.file) });
  }
  writeJson(path.join(directory, 'evidence-set.json'), set);
  return { set, copied };
}

function reviewMarkdown(packet, sourceNotes, renderedEvidence) {
  const { project, evidence, evidenceSets, review, missing, awaitingAPerson } = packet;
  const captures = renderedEvidence?.set ?? evidenceSets.at(-1);
  const fileFor = new Map((renderedEvidence?.copied ?? []).map((entry) => [entry.capture.id, entry.file]));
  const lines = [
    `# Product review packet — ${evidence.business.name}`,
    '',
    'The factory filled in everything it can prove. It has deliberately not filled in the review.',
    'Nothing below is a verdict; the verdict is yours.',
    '',
    '## The run',
    '',
    `- project: ${project.name} (${project.type}, \`${project.id}\`)`,
    `- factory commit: ${evidence.run.factoryCommit}`,
    `- started: ${evidence.run.startedAt}`,
    `- completed: ${evidence.run.completedAt}`,
    `- workspace: ${project.workspacePath ?? 'none'}`,
    '',
    '## Sources and rights',
    '',
    '| source | kind | rights | sha256 (as ingested) |',
    '| --- | --- | --- | --- |',
    ...evidence.sources.map((source) => `| ${source.label} | ${source.kind} | ${source.rightsStatus} | \`${source.sha256.slice(0, 16)}…\` |`),
    '',
    'Every hash above is what the knowledge pack recorded, so a source named here',
    'is a source the factory actually ingested.',
    '',
  ];

  if (sourceNotes.length) {
    lines.push('### Files you need to place', '', ...sourceNotes.map((note) => `- ${note}`), '');
  }

  lines.push(
    '## What to judge',
    '',
    'The acceptance contract needs all five, and each is a judgement no script makes:',
    '',
    '1. **Factual accuracy** — is every claim on the site supported by an approved source?',
    '2. **Brand fit** — does it look like this business, or like a template with its colour changed?',
    '3. **Visual quality** — would you show it to the owner without apologising for it?',
    '4. **Responsive quality** — does the phone layout look designed, or collapsed?',
    '5. **Accessibility** — beyond the automated pass: focus order, contrast in context, real keyboard use.',
    '',
    'Then count every meaningful manual edit you had to make before it was launchable.',
    'An edit you would not defend to the business is not meaningful, and neither is',
    'one you skipped to avoid recording it.',
    '',
  );

  if (captures) {
    lines.push(
      '## Rendered evidence',
      '',
      `Set \`${captures.id}\`: ${captures.captures.length} captures across ${captures.viewports.length} viewports.`,
      '',
      ...captures.captures.map((capture) => {
        const file = fileFor.get(capture.id);
        const label = `${capture.route} · ${capture.viewport} · ${capture.state.axis}/${capture.state.state}`;
        return `- ${file ? `[${label}](${file})` : label} — ${capture.state.proves}`;
      }),
      '',
    );
    if (captures.uncovered.length) {
      lines.push(
        'These states are **not** proven by a picture, and the review should not assume them:',
        '',
        ...captures.uncovered.map((entry) => `- ${entry.route} · ${entry.axis}/${entry.state} — ${entry.reason}${entry.detail ? ` (${entry.detail})` : ''}`),
        '',
      );
    }
  }

  if (review?.opportunities?.length) {
    lines.push(
      '## What the factory already knows is weak',
      '',
      'Fix what the factory can fix before counting edits against the budget.',
      '',
      ...review.opportunities.map((item) => `- **${item.title}** — ${item.detail}${item.blockedOnOperator ? ' _(blocked on you, not the factory)_' : ''}`),
      '',
    );
  }

  if (missing.length) {
    lines.push('## This run cannot be validated yet', '', ...missing.map((entry) => `- ${entry}`), '');
  }

  lines.push(
    '## Fill these in before validating',
    '',
    ...awaitingAPerson.map((entry) => `- [ ] ${entry}`),
    '',
    'Then:',
    '',
    '```bash',
    'npm run acceptance:genuine-business:validate -- <packet>/evidence.json',
    '```',
    '',
    'The draft is `evidence.draft.json`. Rename it once you have completed it —',
    'the validator refuses a draft, which is deliberate: an unreviewed run must',
    'not be able to pass by accident.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

export function writeReviewPacket(service, packet) {
  const { outDir, project } = packet;
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts = path.join(outDir, 'artifacts');

  const manifestFile = writeJson(path.join(artifacts, 'project-manifest.json'), packet.manifest);
  const packFile = packet.knowledgePack ? writeJson(path.join(artifacts, 'knowledge-pack.json'), packet.knowledgePack) : null;
  const compositionFile = packet.composition ? writeJson(path.join(artifacts, 'composition.json'), packet.composition) : null;
  const verificationFile = writeJson(path.join(artifacts, 'verification.json'), packet.verification);
  if (packet.intakeBundle) writeJson(path.join(artifacts, 'approved-intake.json'), packet.intakeBundle);

  if (project.workspacePath && fs.existsSync(project.workspacePath)) {
    copyRepository(project.workspacePath, path.join(outDir, 'generated-app'));
  }

  const relative = (file) => (file ? { path: path.relative(outDir, file.path).split(path.sep).join('/'), sha256: file.sha256 } : null);
  packet.evidence.artifacts = {
    manifest: relative(manifestFile),
    knowledgePack: relative(packFile),
    composition: relative(compositionFile),
    verificationReport: relative(verificationFile),
    generatedRepository: { path: 'generated-app' },
  };

  const launchReadinessFile = project.workspacePath ? path.join(project.workspacePath, '.app-builder', 'launch-readiness.json') : null;
  if (launchReadinessFile && fs.existsSync(launchReadinessFile)) {
    const report = JSON.parse(fs.readFileSync(launchReadinessFile, 'utf8'));
    packet.evidence.launchReadiness = {
      predictedManualEdits: report.predictedManualEdits ?? 0,
      blockersAtHandover: (report.findings ?? []).filter((finding) => finding.severity === 'blocker').length,
      evidenceGaps: (report.evidenceGaps ?? []).length,
      reportPath: 'artifacts/launch-readiness.json',
    };
    writeJson(path.join(artifacts, 'launch-readiness.json'), report);
  } else {
    packet.missing.push('No launch-readiness report in the workspace. Run `npm run audit:launch` and record it before handover.');
  }

  const sourceNotes = suppliedOriginals(service, project.id, packet, outDir);
  const renderedEvidence = copyRenderedEvidence(service, project.id, packet, outDir);
  writeJson(path.join(outDir, 'evidence.draft.json'), packet.evidence);
  fs.writeFileSync(path.join(outDir, 'REVIEW.md'), reviewMarkdown(packet, sourceNotes, renderedEvidence));
  return { outDir, sourceNotes, renderedCaptures: renderedEvidence?.copied.length ?? 0 };
}
