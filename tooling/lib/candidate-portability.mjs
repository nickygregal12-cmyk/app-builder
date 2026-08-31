/**
 * Whether a candidate is a repository somebody could actually be handed.
 *
 * A visual candidate is offered to a reviewer as a picture, and a picture is
 * silent about everything that makes the thing behind it real. The repository
 * might not install. `npm run check` might not pass. The production build might
 * fail, or succeed and emit nothing. It might import `@app-builder/*` and only
 * run inside the factory that made it. None of that is visible in a screenshot,
 * and all of it decides whether the candidate is a product or a rendering.
 *
 * Until now the proof existed but arrived in the wrong order. `verifyCandidate`
 * ran check and build before capture, so a candidate that could not build never
 * reached a screenshot — but the factory-dependency check ran only on
 * *promotion*, which is after the review that promotion depends on. A reviewer
 * could therefore spend real money judging a candidate that was never proven to
 * be free of the factory, and the answer would arrive too late to be worth
 * anything.
 *
 * So the proof moves in front of the review, and — the part that matters — it
 * becomes *recorded*. `verifyCandidate` threw on failure and returned a path on
 * success, which means a passing candidate carried no evidence that anything had
 * been checked. A reviewer reading the packet had to take portability on faith,
 * and a check nobody can see is indistinguishable from a check nobody ran.
 *
 * WHAT THIS IS NOT
 *
 * It is not a quality judgement. Whether the site is any good is the reviewer's
 * question and this must not pre-empt it. This answers only: is there a
 * repository here, does it stand up on its own, and did it ship something.
 *
 * It is also not a claim to have installed every candidate independently. A set
 * shares one install deliberately — the directions resolve byte-identical
 * `package.json` files, and installing three times would be three times the wall
 * clock for the same tree. The record says which candidate paid for the install
 * and which inherited it, because "installable" and "installed from a sibling
 * whose manifest is byte-identical" are different claims and only one of them
 * was proven directly.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * A dependency prefix that would tie a generated repository to its factory.
 *
 * The workspace packages are the obvious case. `file:` and `link:` specifiers
 * are the same defect wearing a different name: a dependency resolved through
 * the local filesystem is one that does not survive being handed to anybody, and
 * it would install cleanly here and fail everywhere else.
 */
const FACTORY_SCOPE = '@app-builder/';
const LOCAL_SPECIFIER = /^(file|link|portal):/;

const bytesOf = (file) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

/** Every file under a directory, relative and sorted, so the walk is stable. */
function walk(root, prefix = '') {
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) found.push(...walk(root, relative));
    else found.push(relative);
  }
  return found;
}

/**
 * What a candidate's `package.json` says about where it can live.
 *
 * Reported rather than thrown, because the caller assembles a record and a
 * refusal that names every shortfall at once is more useful than the first one.
 */
export function inspectFactoryIndependence(workspace) {
  const manifestPath = path.join(workspace, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, offenders: [], detail: 'There is no package.json, so this is not a repository at all.' };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies };
  const offenders = Object.entries(declared)
    .filter(([name, range]) => name.startsWith(FACTORY_SCOPE) || LOCAL_SPECIFIER.test(String(range)))
    .map(([name, range]) => `${name}@${range}`);
  return {
    ok: offenders.length === 0,
    offenders,
    detail: offenders.length
      ? `Depends on the factory or on this filesystem: ${offenders.join(', ')}. A generated project must stay an ordinary repository.`
      : 'Declares no factory-scoped or filesystem-local dependency.',
  };
}

/**
 * What the production build actually emitted.
 *
 * An exit code of zero is not the same as having shipped something. A build can
 * succeed and write an empty directory, and the resulting candidate would be
 * photographed as a blank page with nothing anywhere saying why. So the artifact
 * is measured: a shell to serve, documents to route to, and bytes.
 */
export function inspectShippingArtifact(workspace, { artifactDir = 'dist' } = {}) {
  const root = path.join(workspace, artifactDir);
  const files = walk(root);
  const documents = files.filter((file) => file.endsWith('.html'));
  const totalBytes = files.reduce((sum, file) => sum + bytesOf(path.join(root, file)), 0);
  const hasShell = files.includes('index.html');
  const shortfalls = [];
  if (!files.length) shortfalls.push(`The build produced no files in ${artifactDir}/.`);
  else if (!hasShell) shortfalls.push(`The build produced ${files.length} file(s) but no ${artifactDir}/index.html, so nothing can serve the site.`);
  return {
    ok: shortfalls.length === 0,
    artifactDir,
    fileCount: files.length,
    documentCount: documents.length,
    totalBytes,
    hasShell,
    shortfalls,
  };
}

/**
 * The renderer a candidate was built through.
 *
 * A visual direction changes presentation and never capability, so every
 * candidate in a set must have come through the same renderer as the canonical
 * build. A candidate that silently switched renderer is not a variant of the
 * product; it is a different product, and comparing it to its siblings would be
 * comparing two things that were never the same.
 */
export function inspectRenderer(actual, expected) {
  if (!expected) return { ok: true, actual: actual ?? null, expected: null, detail: 'No canonical renderer was declared to compare against.' };
  const ok = actual === expected;
  return {
    ok,
    actual: actual ?? null,
    expected,
    detail: ok
      ? `Built through the canonical renderer (${expected}).`
      : `Built through ${actual ?? 'an undeclared renderer'}, but the canonical build used ${expected}. A direction changes presentation, not the renderer.`,
  };
}

/**
 * One candidate's portability record.
 *
 * `steps` carries what was executed and what it cost; the inspections carry what
 * was true afterwards. Both travel with the evidence so a reviewer can see that
 * the repository stands up without having to run anything.
 */
export function buildPortabilityRecord({
  candidateId,
  workspace,
  installMode,
  installedFrom = null,
  steps = [],
  renderer = null,
  expectedRenderer = null,
  artifactDir = 'dist',
} = {}) {
  const independence = inspectFactoryIndependence(workspace);
  const artifact = inspectShippingArtifact(workspace, { artifactDir });
  const rendererCheck = inspectRenderer(renderer, expectedRenderer);
  const failedSteps = steps.filter((step) => step.ok === false);

  const shortfalls = [
    ...failedSteps.map((step) => `\`${step.command}\` failed.`),
    ...(independence.ok ? [] : [independence.detail]),
    ...artifact.shortfalls,
    ...(rendererCheck.ok ? [] : [rendererCheck.detail]),
  ];

  return {
    schemaVersion: 1,
    candidateId: candidateId ?? null,
    install: {
      // Two different claims, never collapsed into one. Only `clean` means this
      // workspace resolved the tree itself.
      mode: installMode,
      installedFrom,
      detail: installMode === 'clean'
        ? 'Installed from its own package.json under the repository convention.'
        : `Shared the tree installed for ${installedFrom}, whose package.json is byte-identical to this one.`,
    },
    steps,
    factoryIndependence: independence,
    artifact,
    renderer: rendererCheck,
    portable: shortfalls.length === 0,
    shortfalls,
  };
}

/**
 * Refuse to send an unbuildable candidate to review.
 *
 * An independent review costs money, and a reviewer asked to judge a repository
 * that does not stand up spends it answering the wrong question. Whatever they
 * conclude about the composition is then attached to a candidate nobody could
 * ship, which is worse than having asked nothing.
 */
export function assertPortableForReview(records) {
  const broken = records.filter((record) => !record.portable);
  if (!broken.length) return records;
  const detail = broken
    .map((record) => `${record.candidateId}: ${record.shortfalls.join(' ')}`)
    .join('\n  ');
  throw new Error(`${broken.length} of ${records.length} candidate(s) are not portable and must not reach a review:\n  ${detail}`);
}

/** The set-level summary, for a report or a packet header. */
export function summarisePortability(records) {
  const portable = records.filter((record) => record.portable);
  return {
    schemaVersion: 1,
    total: records.length,
    portable: portable.length,
    // A set is only reviewable if every candidate in it is. A reviewer comparing
    // three candidates of which one cannot build is not comparing three.
    allPortable: records.length > 0 && portable.length === records.length,
    cleanInstalls: records.filter((record) => record.install.mode === 'clean').length,
    totalArtifactBytes: records.reduce((sum, record) => sum + (record.artifact?.totalBytes ?? 0), 0),
    shortfalls: records.flatMap((record) => record.shortfalls.map((shortfall) => `${record.candidateId}: ${shortfall}`)),
  };
}
