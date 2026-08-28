import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

/**
 * Candidate workspaces — Phase 4D.
 *
 * A candidate needs a real repository to be evidence of anything: a screenshot
 * of a build that was never installed and never built proves nothing about the
 * build someone would deploy. So each candidate is generated, installed and
 * built exactly like the canonical one.
 *
 * The part worth stating is what happens afterwards. A candidate workspace is
 * **temporary**. Every one of them is removed when a candidate is promoted, the
 * promoted direction included, because promotion writes an ordinary durable
 * design choice and the next canonical build renders from that. Leaving them
 * behind is how a project acquires four competing forks of itself and loses
 * track of which one is the product.
 */

/** Where a candidate set's temporary workspaces live, beside the project's builds. */
export function candidateRoot(workspacesRoot, slug, setId) {
  return path.join(path.resolve(workspacesRoot), `${slug}-candidates`, setId);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().split('\n').slice(-6).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}: ${detail || `exit code ${result.status}`}`);
  }
  return result;
}

/**
 * Install once, share across the set.
 *
 * A visual direction changes presentation, never capabilities, so every
 * candidate in a set resolves the same recipes and produces a byte-identical
 * `package.json`. Installing three times would be three times the wall clock
 * for the same tree.
 *
 * The equality is asserted rather than assumed. If a direction ever did change
 * what a build depends on, sharing an install would silently give a candidate
 * dependencies it never declared, and this refuses instead.
 */
export function installSharedDependencies(workspaces) {
  if (!workspaces.length) return;
  const [first, ...rest] = workspaces;
  const reference = fs.readFileSync(path.join(first, 'package.json'), 'utf8');
  for (const workspace of rest) {
    const candidate = fs.readFileSync(path.join(workspace, 'package.json'), 'utf8');
    if (candidate !== reference) {
      throw new Error(`Candidate ${path.basename(workspace)} declares different dependencies from ${path.basename(first)}. A visual direction changes presentation, not capability, so this is a defect rather than something to install around.`);
    }
  }
  run('npm', ['install', '--no-audit', '--no-fund'], first);
  const source = path.join(first, 'node_modules');
  for (const workspace of rest) fs.cpSync(source, path.join(workspace, 'node_modules'), { recursive: true });
}

/** Verify and build a candidate the way its own repository would be verified. */
export function verifyCandidate(workspace) {
  run('npm', ['run', 'check'], workspace);
  run('npm', ['run', 'build'], workspace);
  return path.join(workspace, 'dist');
}

/**
 * Remove a set's workspaces.
 *
 * Called on promotion and on abandonment alike. The promoted candidate's
 * workspace goes too: what survives a promotion is the durable design choice,
 * and the next canonical build renders from that. A candidate workspace that
 * outlived its decision is a fork nobody decided to keep.
 */
export function removeCandidateWorkspaces(root) {
  fs.rmSync(root, { recursive: true, force: true });
  const parent = path.dirname(root);
  // Remove the per-project candidate directory too, but only once it is empty:
  // a second set running concurrently must not have its workspaces taken away.
  try {
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
  } catch {
    // A parent that is not empty, or has already gone, is not a failure.
  }
}

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
});

function isFile(candidate) {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * The document a static build serves for an address.
 *
 * The first version of this asked one question — is the resolved path a file? —
 * which is only true of a single-document SPA. A prerendered build answers
 * `/services` with `services/index.html` and `/404` with `404.html`, so every
 * multi-document route resolved to a directory, failed the file test and fell
 * through to the shell. Six routes were photographed as the home page and the
 * capture reported success, because HTTP 200 and a screenshot were the whole
 * test.
 *
 * So the lookup is the ordinary static-hosting one, in the order a host uses:
 * the exact file, then the directory's index document, then the same address
 * with `.html`. Only an address that matches none of those falls back to the
 * shell, which is what a genuine SPA needs and what a prerendered build now
 * never reaches.
 */
export function resolveBuildDocument(root, pathname) {
  let resolved;
  try {
    resolved = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  } catch {
    // A malformed address resolves to nothing rather than escaping the root.
    return null;
  }
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  if (isFile(resolved)) return resolved;
  for (const candidate of [path.join(resolved, 'index.html'), `${resolved}.html`]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Serve a build's own output for evidence capture.
 *
 * Static rather than the dev server, deliberately. A candidate set is then
 * photographed from the same kind of rendering — the built one, which is what a
 * visitor would get — and a comparison is only worth making between like and
 * like. It also means nothing is reviewed on a rendering that exists only while
 * a dev server is running, which is the failure that had an independent critic
 * reporting a development-only metadata strip as a defect in a public footer.
 *
 * Named for what it serves rather than for who first needed it: the ordinary
 * project lane uses this too, through `captureRenderedEvidence(id, { against:
 * 'built-artifact' })`, which is the compliant path for evidence a review may
 * treat as a claim about what ships.
 *
 * Bound to loopback and rooted at one directory. A request that resolves
 * outside `dist` is refused rather than served, and an address that matches no
 * document falls back to the app shell so a client-side router can answer it.
 */
export function serveBuiltArtifact(dist) {
  const root = path.resolve(dist);
  const shell = path.join(root, 'index.html');
  if (!fs.existsSync(shell)) throw new Error(`Candidate build has no index.html at ${root}. Build it before capturing evidence.`);
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      let file = shell;
      try {
        const requested = new URL(request.url, 'http://127.0.0.1').pathname;
        file = resolveBuildDocument(root, requested) ?? shell;
      } catch {
        // A malformed address gets the shell, which is what an unknown route gets.
      }
      response.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
      response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
