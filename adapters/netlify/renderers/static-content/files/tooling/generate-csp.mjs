#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A Content-Security-Policy this build can actually be served under.
 *
 * Written after the build rather than shipped as a constant, because the one
 * directive that matters cannot be known in advance. This site's own scripts are
 * inline — a navigation disclosure, an analytics dispatch, an error reporter —
 * and a policy that allowed them with `'unsafe-inline'` would be a policy that
 * allows any injected script too, which is most of what a CSP is for. So each
 * inline script is hashed and named, and nothing else runs.
 *
 * `netlify.toml` keeps the headers that are the same for every build. This
 * writes one file with the header that is not, so neither is restating the
 * other. Netlify reads `_headers` from the publish directory.
 *
 * If a build genuinely needs a third-party origin — an embedded map, a hosted
 * font, an analytics endpoint — extend `csp.json` beside this script rather than
 * loosening a directive. The default is that a generated site talks to itself.
 */

const PUBLISH = process.env.PUBLISH_DIR ?? 'dist';
const EXTRA = 'csp.json';

/** Directives a project may extend, and the value each starts from. */
const BASE = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'style-src': ["'self'"],
  'connect-src': ["'self'"],
  'script-src': ["'self'"],
};

function htmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

/**
 * The bytes a browser hashes are the element's text content exactly as it
 * appears — no trimming, no re-indenting. A hash computed over a tidied copy is
 * a hash of something the page does not contain.
 */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attributes, body] = match;
    if (/\ssrc\s*=/i.test(attributes)) continue;
    if (!body) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

export function inlineStyleHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)) {
    const body = match[2];
    if (!body) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return hashes;
}

export function buildPolicy(directives) {
  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${[...new Set(values)].join(' ')}`)
    .join('; ');
}

function main() {
  const publish = path.resolve(PUBLISH);
  const pages = htmlFiles(publish);
  if (!pages.length) {
    console.log(`No HTML in ${PUBLISH}; nothing to write a policy for.`);
    return;
  }

  const directives = Object.fromEntries(Object.entries(BASE).map(([key, values]) => [key, [...values]]));
  if (fs.existsSync(EXTRA)) {
    const extra = JSON.parse(fs.readFileSync(EXTRA, 'utf8'));
    for (const [directive, values] of Object.entries(extra.directives ?? {})) {
      if (!Object.hasOwn(directives, directive)) {
        throw new Error(`csp.json extends ${directive}, which this policy does not define. Add it deliberately rather than by typo.`);
      }
      // `'unsafe-inline'` in script-src would defeat the hashes below, which is
      // the whole reason this file is generated rather than written by hand.
      if (directive === 'script-src' && values.includes("'unsafe-inline'")) {
        throw new Error("csp.json adds 'unsafe-inline' to script-src, which allows every injected script and makes the hashes pointless. Name the origin you need instead.");
      }
      directives[directive].push(...values);
    }
  }

  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    directives['script-src'].push(...inlineScriptHashes(html));
    directives['style-src'].push(...inlineStyleHashes(html));
  }

  const policy = buildPolicy(directives);
  const headersPath = path.join(publish, '_headers');
  fs.writeFileSync(headersPath, `/*\n  Content-Security-Policy: ${policy}\n`);

  const scripts = directives['script-src'].filter((value) => value.startsWith("'sha256-")).length;
  const styles = directives['style-src'].filter((value) => value.startsWith("'sha256-")).length;
  console.log(`Wrote ${path.relative(process.cwd(), headersPath)} for ${pages.length} page(s): ${scripts} inline script hash(es), ${styles} inline style hash(es).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
