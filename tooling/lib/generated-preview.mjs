import fs from 'node:fs';
import path from 'node:path';

/**
 * What starting a generated project's dev server requires.
 *
 * A template whose dev server would daemonise itself declares what stops it,
 * and `generateProject` writes that declaration into the generated repository
 * at `.app-builder/project.json`. The factory service already reads it before
 * supervising a preview. Every other harness that starts a generated project
 * has to read the same thing, for the same reason: a dev server that forks and
 * exits looks to its parent like a server that died, and it outlives the run
 * that started it.
 *
 * The static/content renderer is what made this a real defect rather than a
 * contract nobody exercised. `astro dev` backgrounds itself when it detects an
 * agentic environment, so the harness that hard-coded "no env" failed with
 * `Process from config.webServer exited early` and left an orphan daemon
 * holding the port — and only on the machines that detection fires on, which
 * is why hosted CI stayed green.
 *
 * A project without the record still starts. It gets the behaviour it had
 * before the template declared anything, which is the correct answer for a
 * repository someone cloned without factory state.
 *
 * @param {string} projectDir path to the generated repository
 * @returns {Record<string, string>} environment the dev server needs
 */
export function generatedPreviewEnv(projectDir) {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(projectDir, '.app-builder/project.json'), 'utf8'));
    const env = record?.preview?.env;
    if (!env || typeof env !== 'object') return {};
    return Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string'));
  } catch {
    return {};
  }
}
