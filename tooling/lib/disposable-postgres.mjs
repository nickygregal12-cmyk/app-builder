/**
 * A throwaway PostgreSQL cluster for deterministic recovery acceptance.
 *
 * Stage Q12 needs a real database to prove a real restore against, and it must not need a cloud
 * project to do it. A production Supabase project is not the contract being proven — "the rows come
 * back" is — so this starts an ordinary local cluster on a Unix socket, and throws it away
 * afterwards. No docker daemon, no network listener, no shared state, nothing to clean up by hand.
 *
 * Everything runs through the provider's own binaries. That is deliberate: `pg_dump` and
 * `pg_restore` are the tools an operator would actually use, and a recovery test that exercises a
 * hand-written export path proves that the hand-written path works.
 */

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { chown, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/** Newest first: the client must never be older than the server it dumps. */
const BIN_ROOTS = ['/usr/lib/postgresql', '/usr/pgsql', '/opt/homebrew/opt/postgresql/bin'];

function candidateBinDirectories() {
  const found = [];
  for (const root of BIN_ROOTS) {
    if (!existsSync(root)) continue;
    if (existsSync(path.join(root, 'initdb'))) { found.push(root); continue; }
    try {
      const versions = readdirSync(root)
        .filter((name) => /^\d+/.test(name))
        .sort((left, right) => Number.parseInt(right, 10) - Number.parseInt(left, 10));
      for (const version of versions) {
        const binary = path.join(root, version, 'bin');
        if (existsSync(path.join(binary, 'initdb'))) found.push(binary);
      }
    } catch { /* an unreadable directory is simply not a candidate */ }
  }
  return found;
}

/**
 * Where the server binaries are, or `null`.
 *
 * `null` is reported to the caller rather than swallowed. A recovery gate that quietly skips itself
 * when Postgres is absent is a gate that reports success for a rehearsal it never ran.
 */
export function locatePostgresBin() {
  const explicit = process.env.APP_BUILDER_POSTGRES_BIN;
  if (explicit && existsSync(path.join(explicit, 'initdb'))) return explicit;
  return candidateBinDirectories()[0] ?? null;
}

/**
 * Run a Postgres binary.
 *
 * `initdb` and `pg_ctl` refuse to run as root, which is correct of them and inconvenient here:
 * containers routinely run builds as root. Dropping to an unprivileged account for exactly those
 * calls is the supported answer and keeps the acceptance runnable in both shapes without weakening
 * anything — the alternative would be running a database server as root to make a test easier.
 */
function run(binDirectory, command, args, { cwd, env = {}, input, user = null } = {}) {
  return new Promise((resolve, reject) => {
    const executable = path.join(binDirectory, command);
    const merged = { ...process.env, ...env, PATH: `${binDirectory}:${process.env.PATH ?? ''}` };
    const child = user
      ? spawn('su', [user, '-s', '/bin/sh', '-c', [executable, ...args].map((entry) => `'${String(entry).replaceAll("'", "'\\''")}'`).join(' ')], { cwd, env: merged })
      : spawn(executable, args, { cwd, env: merged });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/**
 * Start a disposable cluster and return a handle.
 *
 * The cluster listens on a Unix socket only (`listen_addresses=''`). A test database that accepts
 * TCP is a test database something else can connect to, and this one holds seeded rows that exist
 * to be destroyed.
 */
export async function startDisposablePostgres({ label = 'recovery' } = {}) {
  const binDirectory = locatePostgresBin();
  if (!binDirectory) {
    throw new Error('No PostgreSQL server binaries found. Set APP_BUILDER_POSTGRES_BIN or install postgresql.');
  }
  // Root cannot own a cluster, so when the process is root the cluster is owned by an unprivileged
  // account that must already exist. `postgres` is the account the distribution package creates.
  const asUser = typeof process.getuid === 'function' && process.getuid() === 0 ? (process.env.APP_BUILDER_POSTGRES_USER ?? 'postgres') : null;
  const root = await mkdtemp(path.join(os.tmpdir(), `app-builder-${label}-`));
  const dataDirectory = path.join(root, 'data');
  const socketDirectory = path.join(root, 'sock');

  const shell = async (command, args, options = {}) => run(binDirectory, command, args, { ...options, user: asUser });
  // The temporary root is created by this process; the cluster owner has to be able to write in it.
  await mkdir(dataDirectory, { recursive: true });
  await mkdir(socketDirectory, { recursive: true });
  if (asUser) {
    // `initdb` sets the data directory's permissions itself, which it can only do as its owner.
    const uid = Number(execFileSync('id', ['-u', asUser], { encoding: 'utf8' }).trim());
    const gid = Number(execFileSync('id', ['-g', asUser], { encoding: 'utf8' }).trim());
    for (const directory of [root, dataDirectory, socketDirectory]) await chown(directory, uid, gid);
  }

  await shell('initdb', ['-D', dataDirectory, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-sync']);
  const port = 5433 + (process.pid % 500);
  await shell('pg_ctl', [
    '-D', dataDirectory,
    '-o', `-p ${port} -k ${socketDirectory} -c listen_addresses= -c fsync=off -c full_page_writes=off`,
    '-l', path.join(root, 'server.log'),
    '-w', 'start',
  ]);

  return {
    binDirectory,
    root,
    dataDirectory,
    socketDirectory,
    port,
    database: 'postgres',
    /**
     * Run `psql` against the cluster, returning unaligned tuples.
     *
     * `session` sets server parameters for that connection only, which is how a query can be asked
     * as a different role with different JWT claims without a transaction preamble whose command
     * tags would end up in the answer.
     */
    async psql(sql, { file = null, session = null } = {}) {
      const args = ['-h', socketDirectory, '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'];
      if (file) args.push('-f', file);
      else args.push('-c', sql);
      const env = session
        ? { PGOPTIONS: Object.entries(session).map(([key, value]) => `-c ${key}=${value}`).join(' ') }
        : {};
      const { stdout } = await shell('psql', args, { env });
      return stdout;
    },
    async pgDump(target) {
      await shell('pg_dump', ['-h', socketDirectory, '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-Fc', '-f', target]);
      return (await stat(target)).size;
    },
    async pgRestore(source) {
      await shell('pg_restore', ['-h', socketDirectory, '-p', String(port), '-U', 'postgres', '-d', 'postgres', '--clean', '--if-exists', '--no-owner', source]);
    },
    async stop() {
      try { await shell('pg_ctl', ['-D', dataDirectory, '-m', 'immediate', '-w', 'stop']); } catch { /* already gone */ }
      await rm(root, { recursive: true, force: true });
    },
  };
}
