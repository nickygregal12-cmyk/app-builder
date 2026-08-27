/**
 * Stage Q9, priority 3 — is a live credential committed anywhere in this repository?
 *
 * `tooling/model-execution-doctor.mjs` already asks this of the six files the model lane owns, by
 * shape rather than by variable name, because the failure it catches is somebody pasting a working
 * key into a config "just to test it". That reasoning is right and its scope is not: the same paste
 * lands just as easily in a recipe, a template, a fixture or an adapter's `.env.example`, and those
 * are the files that get copied into somebody else's repository.
 *
 * So this is the same question over the whole tree, and the design constraint is signal rather than
 * coverage. Every rule below matches a shape that is a credential and is not anything else:
 * `AKIA` followed by sixteen uppercase characters is an AWS access key id and is not a word; a PEM
 * private-key banner is not a sentence; a JWT whose payload decodes to `"role":"service_role"` is a
 * Supabase key that bypasses row-level security and is not a coincidence.
 * There is deliberately no entropy heuristic and no `password\\s*=` rule: both find hundreds of
 * things in a real repository, and a scanner people learn to ignore is worse than none.
 *
 * No dependency. A scanner is regular expressions over files, and the interesting part is which
 * expressions — not whose package they arrived in. `tooling/secret-scan.test.mjs` plants a finding
 * for every rule, assembling each one from fragments at run time so that no file in this repository
 * ever contains a contiguous string shaped like a live credential.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Every rule. Each one names what it matches and why that shape cannot be something innocent, since
 * a finding a reader cannot evaluate is a finding they will suppress.
 */
export const SECRET_RULES = Object.freeze([
  {
    id: 'private-key-block',
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
    detail: 'A private key block. There is no version of this that belongs in a repository.',
  },
  {
    id: 'aws-access-key-id',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    detail: 'An AWS access key id. The prefix and the fixed length are not a word.',
  },
  {
    id: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    detail: 'A GitHub token. The prefix is reserved and the length is fixed.',
  },
  {
    id: 'anthropic-key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{24,}/,
    detail: 'An Anthropic API key.',
  },
  {
    id: 'openai-key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/,
    detail: 'An OpenAI-shaped API key.',
  },
  {
    id: 'slack-token',
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}/,
    detail: 'A Slack token.',
  },
  {
    id: 'google-api-key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
    detail: 'A Google API key.',
  },
  {
    id: 'npm-token',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/,
    detail: 'An npm access token.',
  },
]);

/**
 * A JWT whose payload claims `service_role`.
 *
 * This is the one that matters most here, and no prefix rule finds it: a Supabase service-role key
 * is an ordinary-looking JWT, and it bypasses row-level security entirely. The whole
 * `database-security` lane exists to prove RLS holds; a committed service-role key makes that proof
 * irrelevant. Matched by decoding rather than by pattern, because the shape of a JWT is not the
 * question — what it claims is.
 */
export function serviceRoleJwtFindings(text) {
  const findings = [];
  for (const match of String(text ?? '').matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}\b/g)) {
    let payload;
    try {
      payload = Buffer.from(match[1], 'base64url').toString('utf8');
    } catch {
      continue;
    }
    if (/"role"\s*:\s*"(?:service_role|supabase_admin)"/.test(payload)) {
      findings.push({ rule: 'supabase-service-role-jwt', detail: 'A JWT claiming service_role. It bypasses row-level security, which is what the database-security lane exists to prove.' });
    }
  }
  return findings;
}

/**
 * The marker that turns a finding into a fixture.
 *
 * Deliberately one exact phrase rather than a path allow-list: a fixture says so on its own line,
 * where a reviewer reading the diff sees it, instead of in a configuration file somewhere else that
 * quietly grows.
 */
export const FIXTURE_MARKER = 'not-a-real-credential';

/** Scan one file's text. Returns a finding per matching line. */
export function scanText(text) {
  const findings = [];
  for (const [index, line] of String(text ?? '').split('\n').entries()) {
    if (line.includes(FIXTURE_MARKER)) continue;
    for (const rule of SECRET_RULES) {
      if (rule.pattern.test(line)) findings.push({ rule: rule.id, line: index + 1, detail: rule.detail });
    }
    for (const finding of serviceRoleJwtFindings(line)) findings.push({ ...finding, line: index + 1 });
  }
  return findings;
}

/**
 * A tracked `.env` file that is not the example.
 *
 * `.gitignore` excludes `.env` and `.env.*` while keeping `.env.example`, so a tracked one is
 * either a mistake or a deliberate `git add -f`. And the example itself must carry names, never
 * values: an example with a value in it is the shape a real one gets copied into.
 */
export function envFileFindings(relativePath, text) {
  const base = path.basename(relativePath);
  if (!base.startsWith('.env')) return [];
  if (base !== '.env.example') {
    return [{ rule: 'env-file-tracked', line: 1, detail: `${base} is tracked. Only .env.example belongs in a repository.` }];
  }
  const findings = [];
  for (const [index, line] of String(text ?? '').split('\n').entries()) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, '');
    // A placeholder is fine and useful. A value that looks like one somebody could use is not.
    if (value === '' || /^(?:<.*>|your[-_].*|changeme|example|TODO|\.\.\.)$/i.test(value)) continue;
    findings.push({ rule: 'env-example-carries-a-value', line: index + 1, detail: `${match[1]} has a value in .env.example. An example carries names, not values.` });
  }
  return findings;
}

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', '.tmp', '.app-builder', 'coverage', 'test-results', 'playwright-report']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.zip', '.gz', '.mp4', '.webm']);

/** Walk a tree and scan every text file in it. */
export function scanRepository(root) {
  const findings = [];
  const queue = [root];
  while (queue.length > 0) {
    const directory = queue.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).replaceAll('\\', '/');
      if (entry.isDirectory()) { queue.push(full); continue; }
      if (BINARY.has(path.extname(entry.name).toLowerCase())) continue;
      let text;
      try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      for (const finding of [...envFileFindings(relative, text), ...scanText(text)]) {
        findings.push({ ...finding, file: relative });
      }
    }
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}
