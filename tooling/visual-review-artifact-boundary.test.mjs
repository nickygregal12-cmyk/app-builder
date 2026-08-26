import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const WORKFLOW = '.github/workflows/visual-review-evidence.yml';
/**
 * What may leave the runner, and why each entry is allowed.
 *
 * Broadening this list is a privacy/source decision, not a convenience. The
 * packet entries were added after checking, field by field, that they publish
 * nothing the two JSON reports already beside them do not:
 *
 * - `packet/index.html` and `packet/review.json` carry the business name, the
 *   frozen-truth hashes, the candidate axes, the refused directions, the
 *   quality gate and the scoped criteria. Every one of those is already in
 *   `report.json` or `review-packets.json`. What they add beyond those is the
 *   review process's own state — `createdAt`, `decision`, `reworkPlans` — and
 *   `designReferences`, which is reduced to a supplied label, registered trait
 *   identifiers and an approval state. No reference URL, source markup, copy,
 *   imagery or stylesheet survives into it, which is the same guarantee
 *   docs/VISUAL_EXCELLENCE.md §9 makes about capture.
 * - `packet/captures/*.png` are copies of the captures already published by the
 *   service entry below.
 *
 * Still excluded, and the reason the assertion is an exact list rather than a
 * prefix: workspaces, the SQLite database, raw sources and the rest of Factory
 * state are not review evidence.
 */
const ALLOWED_UPLOADS = [
  '.app-builder/visual-review/report.json',
  '.app-builder/visual-review/review-packets.json',
  '.app-builder/visual-review/packet/index.html',
  '.app-builder/visual-review/packet/review.json',
  '.app-builder/visual-review/packet/captures/*.png',
  '.app-builder/visual-review/service/**/captures/*.png',
];

function uploadPaths(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s+path:\s*\|\s*$/.test(line));
  assert.notEqual(start, -1, `${WORKFLOW} must declare a literal upload path block.`);
  const indent = lines[start].match(/^\s*/)[0].length;
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent <= indent) break;
    result.push(line.trim());
  }
  return result;
}

test('remote visual review publishes only detached review evidence', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  assert.deepEqual(
    uploadPaths(text),
    ALLOWED_UPLOADS,
    'Do not broaden the visual-review artifact without a deliberate review of the privacy/source boundary. Workspaces, SQLite, raw sources and Factory state are not review evidence.',
  );

  const retention = Number(text.match(/retention-days:\s*(\d+)/)?.[1]);
  assert.ok(Number.isInteger(retention) && retention > 0 && retention <= 7, 'Detached visual review evidence must expire within seven days.');
});

/**
 * The reviewer has to receive the packet, not just the pictures.
 *
 * The captures alone are 36 PNGs named by candidate, route and viewport, with
 * nothing saying what the professional bar is, which criteria are the
 * reviewer's to score, which direction was refused, or what DesignLint already
 * settled. The packet is the surface built to answer exactly that, and it opens
 * from a file:// URL, so a hosted run that uploads the captures without it
 * hands over evidence that cannot be reviewed as evidence.
 */
test('the hosted evidence run uploads the packet a reviewer opens, not only its captures', () => {
  const paths = uploadPaths(fs.readFileSync(WORKFLOW, 'utf8'));
  assert.ok(
    paths.includes('.app-builder/visual-review/packet/index.html'),
    'the portable packet index must travel with the captures, or the download cannot be reviewed',
  );
  assert.ok(
    paths.some((entry) => entry.startsWith('.app-builder/visual-review/packet/captures/')),
    'the packet index is relative to its own captures; uploading it without them publishes a page of broken images',
  );
});

test('superseded visual evidence runs are cancelled but manual runs stay independent', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(text, /group:\s*visual-review-evidence-\$\{\{\s*github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id\s*\}\}/);
  assert.match(text, /cancel-in-progress:\s*true/);
});
