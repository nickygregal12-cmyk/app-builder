/**
 * B1 — the controlled brownfield corpus.
 *
 * Three repositories nobody would confuse for each other, each carrying real
 * defects of a different kind, materialised on demand and thrown away
 * afterwards. They exist because the question "can this factory safely improve
 * an existing product?" cannot be answered by the Predictor. Predictor is the
 * eventual subject, not the practice ground: a first controlled mutation
 * attempt against a mature repository somebody depends on is an experiment
 * whose failure mode is somebody's live application.
 *
 * ## Synthetic, and labelled as such everywhere
 *
 * Every repository here was written to contain the defects the benchmark looks
 * for. That is what makes it a usable measurement of mechanics — the answer is
 * known, so a wrong answer is visible — and exactly what makes it worthless as
 * evidence about real products. It proves the machinery refuses, bounds and
 * measures correctly. It proves nothing about whether the factory can improve a
 * repository nobody shaped for it. `provenance` says `synthetic` on every item
 * and the loader refuses a corpus item that omits it.
 *
 * ## Why the commit SHA is pinned in the corpus file
 *
 * A benchmark whose subject changes between runs is measuring two things at
 * once. These repositories are built from fixed bytes and committed with fixed
 * identities and fixed dates, so a materialised repository lands on the same
 * commit hash every time on any machine. `corpus.v1.json` records that hash,
 * and the benchmark checks it.
 *
 * This is not ceremony. It is the cheapest possible test of the property the
 * whole brownfield path rests on — that a baseline names an exact revision and
 * a later comparison can return to it. If a fixture's bytes drift, the hash
 * moves and the run stops, instead of silently comparing against a different
 * product. It also makes the corpus honest about a thing real repositories do
 * not offer: here, and only here, the "before" is perfectly reproducible.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIRECTORY = path.resolve(HERE, '../../examples/brownfield/b1');

/**
 * The fixed identity every corpus commit is made under.
 *
 * A commit hash covers the author and committer names, emails and timestamps as
 * well as the tree. Leaving any of them to the environment would make the hash
 * depend on whose machine ran the benchmark, which is the opposite of the point.
 */
const FROZEN_COMMIT = Object.freeze({
  name: 'App Builder B1 corpus',
  email: 'b1-corpus@app-builder.invalid',
  date: '2026-01-01T00:00:00+00:00',
  message: 'b1 corpus fixture',
  branch: 'main',
});

function write(root, relative, contents) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function git(root, args) {
  const result = spawnSync('git', ['-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: FROZEN_COMMIT.name,
      GIT_AUTHOR_EMAIL: FROZEN_COMMIT.email,
      GIT_AUTHOR_DATE: FROZEN_COMMIT.date,
      GIT_COMMITTER_NAME: FROZEN_COMMIT.name,
      GIT_COMMITTER_EMAIL: FROZEN_COMMIT.email,
      GIT_COMMITTER_DATE: FROZEN_COMMIT.date,
    },
  });
  return { status: result.status, stdout: (result.stdout ?? '').trim() };
}

// --- The repositories ------------------------------------------------------------
//
// The exact bytes of each fixture live in `examples/brownfield/b1/repositories.v1.json`
// rather than in this module or as real files in this repository, for two
// separate reasons.
//
// They are not source files because they are deliberately defective. An
// unlabelled input, a missing write policy and three competing button
// implementations are the fixture's whole purpose, and checked in as real
// source they would be linted, typechecked, and eventually repaired by somebody
// being helpful — at which point the corpus silently stops testing anything.
//
// They are not string literals in this module because `npm run architecture`
// reads source with a regular expression, and a fixture whose React component
// imports a sibling module by relative path is indistinguishable, to that
// scanner, from this module importing one. Held inline, the storefront fixture
// made `tooling/lib` look as though it reached up into `tooling/`, and the zone
// graph gained a cycle that did not exist. That is not a flaw in the boundary
// checker — a scanner that tried to work out which strings were "really"
// imports would be guessing. Data is not scanned, so the ambiguity never
// arises.

/** The bytes, read once. */
const REPOSITORY_BYTES = JSON.parse(fs.readFileSync(path.join(CORPUS_DIRECTORY, 'repositories.v1.json'), 'utf8')).repositories;

/** Every repository the corpus knows how to build, by the id the tasks name. */
export const B1_REPOSITORIES = Object.freeze(REPOSITORY_BYTES);

/**
 * Build one corpus repository in a temporary directory and commit it.
 *
 * Returns the path and the resulting revision. The caller owns the directory
 * and is expected to remove it; nothing here writes outside the temporary root.
 */
export function materialiseRepository(id, { into = null } = {}) {
  const files = B1_REPOSITORIES[id];
  if (!files) throw new Error(`Unknown B1 repository ${JSON.stringify(id)}. Known: ${Object.keys(B1_REPOSITORIES).join(', ')}`);

  const root = into ?? fs.mkdtempSync(path.join(os.tmpdir(), `b1-${id}-`));
  for (const [relative, contents] of Object.entries(files)) write(root, relative, contents);

  git(root, ['init', '--quiet', '-b', FROZEN_COMMIT.branch]);
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', FROZEN_COMMIT.message]);
  const revision = git(root, ['rev-parse', 'HEAD']).stdout;

  return { id, root, revision };
}

/** Remove a materialised repository. Separate so a failing run can keep one to look at. */
export function discardRepository(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function readCorpusFile(name) {
  return JSON.parse(fs.readFileSync(path.join(CORPUS_DIRECTORY, name), 'utf8'));
}

/**
 * The visible half of the corpus: what a task is, and what it must preserve.
 *
 * Refuses any item that does not label its provenance. Synthetic material that
 * forgets to say it is synthetic is the one way this corpus could do damage —
 * it would become "evidence" in a later report written by somebody who did not
 * build it.
 */
export function loadCorpus() {
  const corpus = readCorpusFile('corpus.v1.json');
  for (const task of corpus.tasks) {
    if (task.provenance !== 'synthetic') {
      throw new Error(`B1 task ${task.id} declares provenance ${JSON.stringify(task.provenance)}. Every repository in this corpus was written to contain the defects it is graded on, and an item that does not say so can be mistaken for real-product evidence.`);
    }
  }
  return corpus;
}

/**
 * The held-out half: how a result is graded, and which files it actually needed.
 *
 * Kept in a separate file for one reason — so that the packet handed to
 * whatever produces a proposal can be assembled from the visible half alone,
 * and a test can assert that none of this leaked into it. A benchmark whose
 * grading criteria are visible to the thing being graded measures how well it
 * reads the grading criteria.
 */
export function loadGrading() {
  return readCorpusFile('grading.v1.json');
}

/**
 * The packet a proposal run is allowed to see.
 *
 * Deliberately assembled by naming fields rather than by deleting the hidden
 * ones from a full task. A denylist quietly starts leaking the moment somebody
 * adds a field to the corpus and forgets to add it here; an allowlist fails
 * closed by simply not carrying the new field.
 */
export function visiblePacket(task) {
  return {
    id: task.id,
    repository: task.repository,
    revision: task.revision,
    toolchain: task.toolchain,
    statement: task.statement,
    intendedImprovement: task.intendedImprovement,
    baseline: task.baseline,
    kind: task.kind,
    declaration: task.declaration,
    provenance: task.provenance,
  };
}
