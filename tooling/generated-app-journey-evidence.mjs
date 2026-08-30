#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { describeDevServer } from './lib/rendering-source.mjs';
import { SIGNAL_KINDS } from './lib/browser-signals.mjs';

/**
 * The review packet for the generated-application journey lane.
 *
 * The bounded serious-application benchmark has one criterion left open —
 * rendered/product evidence receives independent review — and it stayed open
 * for a reason that had nothing to do with reviewers. The lane reported to a
 * terminal, photographed only failures and kept traces only for failures, so a
 * green run produced no screenshot, no result file and no record of what the
 * browser reported. The CI step that publishes its evidence uploaded an empty
 * directory under `if-no-files-found: warn` and said nothing. There was never an
 * object to review.
 *
 * This assembles one. It reads the run Playwright just recorded and writes a
 * single portable directory: the captures, the classified browser signals, and
 * a REVIEW.md that states the boundary before a reviewer starts guessing at it.
 *
 * ## The boundary, stated rather than discovered
 *
 * The lane serves the generated project's Vite dev server. `renderingSource`
 * therefore says `development` and `depictsShippingArtifact: false`, through the
 * same helper the rendered-evidence path uses, because the repository has
 * already paid for the alternative twice: a review packet that photographed the
 * wrong document, and a critic that correctly reported a footer which renders
 * only under `import.meta.env.DEV`. This evidence is what a local browser saw
 * against a development server driving a real Supabase stack. It is honest
 * product-journey evidence and it is not evidence about a deployed artifact.
 *
 * ## What it refuses
 *
 * A lane that quietly stopped running a capability's journeys is worse than a
 * lane that fails, because a shorter green run looks like a faster one. So the
 * expected journeys are named here and a run that lost any of them exits
 * non-zero rather than publishing a packet that reads as complete.
 */

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, '.app-builder/generated-app-journey');
const REPORT = path.join(EVIDENCE, 'playwright-report.json');

/**
 * What the lane is expected to run, by the capability that owns it.
 *
 * Counted per spec rather than listed by title: a journey rename is an ordinary
 * edit and should not fail a gate, while a journey that disappeared is exactly
 * what this is here to catch. The titles that actually ran are recorded in the
 * packet, so nothing is lost by not asserting them.
 */
export const EXPECTED_JOURNEYS = Object.freeze({
  'admin.spec.ts': 2,
  'files.spec.ts': 3,
  'notifications.spec.ts': 1,
  'records.spec.ts': 2,
  'scheduled-decisions.spec.ts': 2,
});

const decode = (attachment) => {
  if (typeof attachment.body === 'string') return Buffer.from(attachment.body, 'base64').toString('utf8');
  if (attachment.path && fs.existsSync(attachment.path)) return fs.readFileSync(attachment.path, 'utf8');
  return null;
};

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/**
 * Every test in a Playwright JSON report, with every attempt it made.
 *
 * All of them, not the last one. Reading `results.at(-1)` is the obvious thing
 * and it is wrong here, and the first hosted run of this lane proved it: three
 * journeys reported errors on their first attempt, two passed on retry, and a
 * packet built from last-attempt-only described a clean run while the job was
 * red. A retry that passed does not unsay what the attempt before it reported —
 * `retries: 1` is there to absorb infrastructure noise, not to edit the record.
 */
export function flattenTests(report) {
  const found = [];
  const walk = (suite, file) => {
    const specFile = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      for (const testCase of spec.tests ?? []) {
        const results = testCase.results ?? [];
        const attempts = results.map((result, index) => ({
          attempt: index + 1,
          status: result.status ?? 'unknown',
          durationMs: result.duration ?? null,
          attachments: result.attachments ?? [],
        }));
        found.push({
          title: spec.title,
          file: path.basename(specFile ?? 'unknown'),
          status: attempts.at(-1)?.status ?? 'unknown',
          attempts,
          attachments: attempts.flatMap((attempt) => attempt.attachments),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, specFile);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
  return found;
}

/**
 * Which expected journeys did not run.
 *
 * A count that came back higher is reported too. It means a journey was added
 * without the packet learning about it, which is a smaller problem than a lost
 * journey but is still the evidence describing a run it did not measure.
 */
export function reconcileJourneys(tests, expected = EXPECTED_JOURNEYS) {
  const counted = {};
  for (const entry of tests) counted[entry.file] = (counted[entry.file] ?? 0) + 1;
  const missing = [];
  const unexpected = [];
  for (const [file, count] of Object.entries(expected)) {
    const ran = counted[file] ?? 0;
    if (ran < count) missing.push({ file, expected: count, ran });
    if (ran > count) unexpected.push({ file, expected: count, ran });
  }
  for (const file of Object.keys(counted)) {
    if (!(file in expected)) unexpected.push({ file, expected: 0, ran: counted[file] });
  }
  return { counted, missing, unexpected, complete: missing.length === 0 };
}

/**
 * The signal inventory across the whole run.
 *
 * Declared signals are counted separately from gated ones and never folded into
 * a single "clean" number. A run with eleven excused 404s and no failures is a
 * different thing from a run with nothing to excuse, and a reviewer should be
 * able to tell them apart without opening a file.
 */
export function summariseSignals(journeys) {
  const byKind = Object.fromEntries(SIGNAL_KINDS.concat('console-warning').map((kind) => [kind, { gated: 0, declared: 0, observed: 0 }]));
  const declarationsUsed = {};
  let unwatched = 0;
  // Counted across every attempt. A journey that reported four errors and then
  // passed on retry contributed four, and a total that quietly dropped them
  // would be the retry editing the record a second time.
  for (const journey of journeys) {
    for (const attempt of journey.attempts ?? []) {
      // An attempt that never ran had nothing to watch. One that ran and
      // recorded nothing is the case worth failing on, because silence from an
      // unwatched journey reads exactly like silence from a clean one.
      if (!attempt.signals) {
        if (attempt.status !== 'skipped' && attempt.status !== 'timedOut') unwatched += 1;
        continue;
      }
      for (const signal of attempt.signals.signals ?? []) {
        const bucket = byKind[signal.kind] ?? (byKind[signal.kind] = { gated: 0, declared: 0, observed: 0 });
        bucket[signal.disposition] = (bucket[signal.disposition] ?? 0) + 1;
        if (signal.declaredBy) declarationsUsed[signal.declaredBy] = (declarationsUsed[signal.declaredBy] ?? 0) + 1;
      }
    }
  }
  return { byKind, declarationsUsed, unwatched, maskedByRetry: journeys.filter((journey) => journey.maskedByRetry).map((journey) => journey.journey) };
}

const attemptSignals = (attempt) => {
  const found = attempt.attachments.find((attachment) => attachment.name === 'browser-signals');
  return found ? JSON.parse(decode(found) ?? 'null') : null;
};

export function buildPacket({ report, tests, captureFiles }) {
  const journeys = tests.map((entry) => {
    const attempts = entry.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      status: attempt.status,
      durationMs: attempt.durationMs,
      signals: attemptSignals(attempt),
    }));
    const final = attempts.at(-1) ?? null;
    return {
      journey: entry.title,
      capability: entry.file.replace(/\.spec\.ts$/, ''),
      status: entry.status,
      captures: captureFiles.get(entry.title) ?? [],
      attempts,
      // Named, because this is the shape in which a lane lies to itself: the
      // job goes green, the summary says "flaky", and what the browser reported
      // on the attempt that failed is never read by anyone.
      maskedByRetry: attempts.length > 1
        && final?.status === 'passed'
        && attempts.slice(0, -1).some((attempt) => attempt.signals && !attempt.signals.clean),
      signals: final?.signals ?? null,
    };
  });
  return {
    schemaVersion: 1,
    lane: 'generated-application-journey',
    startedAt: report.stats?.startTime ?? null,
    renderingSource: describeDevServer({ command: 'npm run dev — the generated benchmark project, on 127.0.0.1:4373' }),
    // Said once, here, so that nothing downstream has to infer it from the
    // rendering source: a picture proves what a state looked like, and the
    // journey result beside it proves the journey completed. Neither proves the
    // other, and a packet that let a reviewer read them as one claim would be
    // repeating the mistake the rendered-evidence schema was written to stop.
    proves: 'What a real browser rendered and reported while each journey ran against a real Supabase stack.',
    doesNotProve: 'Anything about the built artifact, a deployed environment, or a state no journey reached.',
    journeys,
    signals: summariseSignals(journeys),
    reconciliation: reconcileJourneys(tests),
  };
}

function collectCaptures(tests, outDir) {
  const captures = new Map();
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of tests) {
    const files = [];
    let index = 0;
    for (const attachment of entry.attachments) {
      if (attachment.contentType !== 'image/png' || !attachment.path || !fs.existsSync(attachment.path)) continue;
      const name = `${slug(entry.file.replace(/\.spec\.ts$/, ''))}--${slug(entry.title)}${index ? `-${index}` : ''}.png`;
      fs.copyFileSync(attachment.path, path.join(outDir, name));
      files.push(`captures/${name}`);
      index += 1;
    }
    captures.set(entry.title, files);
  }
  return captures;
}

function reviewMarkdown(packet) {
  const lines = [
    '# Generated-application journey evidence',
    '',
    '## What this is',
    '',
    `${packet.proves}`,
    '',
    '## What it is not',
    '',
    `${packet.doesNotProve}`,
    '',
    `The captures were taken against a **${packet.renderingSource.serverMode} server**, and`,
    `\`depictsShippingArtifact\` is \`${packet.renderingSource.depictsShippingArtifact}\`. ${packet.renderingSource.detail}`,
    '',
    '## Journeys',
    '',
    '| Capability | Journey | Result | Attempts | Captures | Gated signals |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const journey of packet.journeys) {
    // Summed over attempts, not taken from the last one. A journey that passed
    // on retry still reported whatever it reported the first time.
    const gated = journey.attempts.some((attempt) => attempt.signals)
      ? journey.attempts.reduce((total, attempt) => total + (attempt.signals?.counts.gated ?? 0), 0)
      : 'not recorded';
    const result = journey.maskedByRetry ? `${journey.status} (masked by retry)` : journey.status;
    lines.push(`| ${journey.capability} | ${journey.journey} | ${result} | ${journey.attempts.length} | ${journey.captures.length} | ${gated} |`);
  }
  lines.push('', '## What the browser reported', '');
  for (const [kind, counts] of Object.entries(packet.signals.byKind)) {
    if (!counts.gated && !counts.declared && !counts.observed) continue;
    lines.push(`- \`${kind}\`: ${counts.gated} gated, ${counts.declared} declared, ${counts.observed} observed`);
  }
  const used = Object.entries(packet.signals.declarationsUsed);
  if (used.length) {
    lines.push('', '### Declarations that excused a signal', '');
    lines.push('Each of these was allowed on purpose. The reason travels in `evidence.json` beside the signals it excused.', '');
    for (const [id, count] of used) lines.push(`- \`${id}\` — ${count} signal(s)`);
  }
  lines.push(
    '',
    '## For the reviewer',
    '',
    'The questions this packet can answer are whether each journey looks like a product a person would use, whether the',
    'captures show the state the journey claims, and whether anything the browser reported was excused that should not have',
    'been. The question it cannot answer is what the deployed application looks like, because nothing here was captured from',
    'one.',
    '',
  );
  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(REPORT)) {
    console.error(`No Playwright report at ${path.relative(ROOT, REPORT)}. Run \`npm run test:e2e:generated-app\`, which writes it.`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const tests = flattenTests(report);
  const captureFiles = collectCaptures(tests, path.join(EVIDENCE, 'captures'));
  const packet = buildPacket({ report, tests, captureFiles });

  fs.writeFileSync(path.join(EVIDENCE, 'evidence.json'), `${JSON.stringify(packet, null, 2)}\n`);
  fs.writeFileSync(path.join(EVIDENCE, 'REVIEW.md'), reviewMarkdown(packet));

  for (const journey of packet.journeys) {
    const gated = journey.signals ? journey.signals.counts.gated : '?';
    console.log(`${journey.status.padEnd(7)} ${journey.captures.length} capture(s)  ${gated} gated  ${journey.journey}`);
  }
  if (packet.signals.unwatched) {
    console.error(`${packet.signals.unwatched} attempt(s) recorded no browser signals. A journey that is not watched is not evidence that nothing went wrong.`);
  }
  // Playwright exits 0 for a journey that failed once and passed on retry, so
  // this is the only place a retried error can still be caught. A retry exists
  // to absorb infrastructure noise; it must not launder a signal nobody
  // declared, because the second run of a flaky failure is not a refutation of
  // the first.
  for (const journey of packet.signals.maskedByRetry) {
    console.error(`"${journey}" reported an undeclared browser error and then passed on retry. The retry is not the answer to it.`);
  }
  for (const entry of packet.reconciliation.missing) {
    console.error(`${entry.file}: expected ${entry.expected} journey(ies), ran ${entry.ran}. A lane that lost a journey publishes a shorter green run, not a faster one.`);
  }
  for (const entry of packet.reconciliation.unexpected) {
    console.error(`${entry.file}: ran ${entry.ran} journey(ies) against ${entry.expected} expected. Update EXPECTED_JOURNEYS so the packet describes the run it measured.`);
  }
  console.log(`Evidence: ${path.relative(ROOT, EVIDENCE)}`);

  const failed = !packet.reconciliation.complete
    || packet.reconciliation.unexpected.length > 0
    || packet.signals.unwatched > 0
    || packet.signals.maskedByRetry.length > 0;
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
