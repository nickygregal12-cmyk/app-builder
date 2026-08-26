import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const BASE = 'adapters/netlify/files/tooling/generate-csp.mjs';
const VARIANT = 'adapters/netlify/renderers/static-content/files/tooling/generate-csp.mjs';

const { buildPolicy, inlineScriptHashes, inlineStyleHashes } = await import(`../${BASE}`);

/**
 * The two copies exist because a renderer variant replaces a contributor's file
 * list and files root wholesale rather than adding to it — which is right for
 * `netlify.toml`, where the static build genuinely needs different content, and
 * incidental for this script, which is the same either way.
 *
 * Duplication that is meant to be identical is duplication that drifts. Today's
 * evidence for that is not hypothetical: a Playwright harness kept its own copy
 * of the preview-env contract, one copy got the fix and the other did not, and
 * the defect was invisible in hosted CI. So the copies are held byte-identical
 * here rather than trusted to stay that way.
 */
test('both copies of the CSP generator are byte-identical', () => {
  assert.equal(fs.readFileSync(BASE, 'utf8'), fs.readFileSync(VARIANT, 'utf8'), `${BASE} and ${VARIANT} have drifted. A fix applied to one and not the other is a security header that is right for one renderer and wrong for the other.`);
});

test('the adapter runs it after every build, for both renderers', () => {
  const adapter = JSON.parse(fs.readFileSync('adapters/netlify/adapter.json', 'utf8'));
  assert.equal(adapter.package.scripts.postbuild, 'node tooling/generate-csp.mjs');
  assert.equal(adapter.renderers['static-content'].package.scripts.postbuild, 'node tooling/generate-csp.mjs');
  assert.ok(adapter.files.includes('tooling/generate-csp.mjs'), 'the base renderer must ship the script it is told to run');
  assert.ok(adapter.renderers['static-content'].files.includes('tooling/generate-csp.mjs'), 'the static renderer must ship it too, or its build calls a file that is not there');
});

/**
 * The bytes a browser hashes are the element's text content exactly as it
 * appears. A hash computed over a tidied copy is a hash of something the page
 * does not contain, and the script it was supposed to allow is blocked.
 */
test('an inline script is hashed over exactly the bytes the page carries', () => {
  const body = '\n  var open = false;\n  console.log("hi");\n';
  const expected = `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  assert.deepEqual(inlineScriptHashes(`<script>${body}</script>`), [expected]);
  // Not the trimmed form, which is the mistake this test exists to catch.
  const trimmed = `'sha256-${crypto.createHash('sha256').update(body.trim(), 'utf8').digest('base64')}'`;
  assert.notEqual(expected, trimmed);
});

test('a script with a src is not hashed, because it is not inline', () => {
  assert.deepEqual(inlineScriptHashes('<script type="module" src="/assets/index.js"></script>'), []);
  assert.deepEqual(inlineScriptHashes('<script src="/a.js"></script><script>var a = 1;</script>').length, 1);
});

test('inline styles are hashed separately, so a page with none does not loosen style-src', () => {
  assert.deepEqual(inlineStyleHashes('<style>body{color:red}</style>').length, 1);
  assert.deepEqual(inlineStyleHashes('<link rel="stylesheet" href="/a.css">'), []);
});

test('the policy denies by default and never allows an object or a framing ancestor', () => {
  const policy = buildPolicy({ 'default-src': ["'self'"], 'object-src': ["'none'"], 'frame-ancestors': ["'none'"] });
  assert.equal(policy, "default-src 'self'; object-src 'none'; frame-ancestors 'none'");
});

/**
 * The end-to-end statement, run over a fixture publish directory rather than a
 * real build, so it holds in `npm run check` without waiting for one: every
 * inline script the pages carry is named by the policy, and nothing is allowed
 * that was not.
 */
test('every inline script in a publish directory is covered, and script-src never falls back to unsafe-inline', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-csp-'));
  const publish = path.join(dir, 'dist');
  try {
    fs.mkdirSync(path.join(publish, 'about'), { recursive: true });
    fs.writeFileSync(path.join(publish, 'index.html'), '<html><body><script>\n  var nav = 1;\n</script><script src="/x.js"></script></body></html>');
    fs.writeFileSync(path.join(publish, 'about/index.html'), '<html><body><script>\n  var other = 2;\n</script></body></html>');

    const script = path.resolve(BASE);
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [script], { cwd: dir, env: { ...process.env, PUBLISH_DIR: 'dist' } });

    const headers = fs.readFileSync(path.join(publish, '_headers'), 'utf8');
    const policy = headers.match(/Content-Security-Policy: (.*)/)[1];

    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/, "a script-src with 'unsafe-inline' allows every injected script, which is most of what a CSP is for");
    assert.doesNotMatch(policy, /'unsafe-eval'/);
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /frame-ancestors 'none'/);

    for (const page of ['index.html', 'about/index.html']) {
      for (const hash of inlineScriptHashes(fs.readFileSync(path.join(publish, page), 'utf8'))) {
        assert.ok(policy.includes(hash), `${page} carries an inline script the policy does not name, so it would be blocked in a browser`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a project may name an origin it needs, and may not use the escape hatch to defeat the hashes', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = path.resolve(BASE);

  const ok = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-csp-ok-'));
  try {
    fs.mkdirSync(path.join(ok, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ok, 'dist/index.html'), '<html><body><script>var a=1;</script></body></html>');
    fs.writeFileSync(path.join(ok, 'csp.json'), JSON.stringify({ directives: { 'connect-src': ['https://plausible.io'] } }));
    execFileSync(process.execPath, [script], { cwd: ok });
    assert.match(fs.readFileSync(path.join(ok, 'dist/_headers'), 'utf8'), /connect-src 'self' https:\/\/plausible\.io/);
  } finally {
    fs.rmSync(ok, { recursive: true, force: true });
  }

  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-csp-bad-'));
  try {
    fs.mkdirSync(path.join(bad, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'dist/index.html'), '<html><body><script>var a=1;</script></body></html>');
    fs.writeFileSync(path.join(bad, 'csp.json'), JSON.stringify({ directives: { 'script-src': ["'unsafe-inline'"] } }));
    assert.throws(() => execFileSync(process.execPath, [script], { cwd: bad, stdio: 'pipe' }), /unsafe-inline/);
  } finally {
    fs.rmSync(bad, { recursive: true, force: true });
  }

  const typo = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-csp-typo-'));
  try {
    fs.mkdirSync(path.join(typo, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(typo, 'dist/index.html'), '<html><body></body></html>');
    fs.writeFileSync(path.join(typo, 'csp.json'), JSON.stringify({ directives: { 'scrpit-src': ["'self'"] } }));
    assert.throws(() => execFileSync(process.execPath, [script], { cwd: typo, stdio: 'pipe' }), /which this policy does not define/);
  } finally {
    fs.rmSync(typo, { recursive: true, force: true });
  }
});

test('netlify.toml keeps the headers that never change, and does not restate the one that does', () => {
  for (const toml of ['adapters/netlify/files/netlify.toml', 'adapters/netlify/renderers/static-content/files/netlify.toml']) {
    const source = fs.readFileSync(toml, 'utf8');
    assert.match(source, /X-Content-Type-Options/, 'the static security headers stay where they can be read and reviewed');
    assert.doesNotMatch(source, /Content-Security-Policy/, `${toml} states a CSP as well as the generated _headers, which is two policies for one build`);
  }
});
