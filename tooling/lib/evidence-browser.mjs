/**
 * Whether this host can actually capture rendered evidence.
 *
 * Rendered evidence is a declared product capability and part of the
 * genuine-business acceptance path, but the only thing that ever checked for a
 * browser was the capture itself. A host could pass the service doctor,
 * generate a real build, verify it and serve a preview, and only discover at
 * `POST /projects/:id/evidence/capture` that the Playwright browser was never
 * installed for the isolated service user. That is a late, avoidable failure
 * after the expensive part of a run.
 *
 * Two states that look alike have to be told apart. The `@playwright/test`
 * package being installed says nothing about whether the browser binary it
 * drives was downloaded, and that is exactly the gap the Phase 3.8E run fell
 * into. They are reported separately here, each with the command that fixes it.
 *
 * Nothing in here launches or downloads a browser: it resolves a path and asks
 * whether the file is there. That keeps the check cheap enough to run in a
 * doctor, and keeps ordinary test runs from fetching a browser to prove a
 * missing one is detected.
 */

import fs from 'node:fs';
import process from 'node:process';

export const BROWSER_EXECUTABLE_VARIABLE = 'APP_BUILDER_BROWSER_EXECUTABLE';
export const EVIDENCE_CAPABILITY_VARIABLE = 'APP_BUILDER_EVIDENCE_CAPTURE';
export const INSTALL_COMMAND = 'npx playwright install chromium';

/**
 * The browser Playwright would launch if nothing pointed it elsewhere.
 *
 * `chromium.executablePath()` reports the managed download's location without
 * starting anything. It throws when the package resolves but cannot report a
 * path, which is itself an answer rather than a crash.
 */
async function managedExecutablePath() {
  let playwright;
  try {
    playwright = await import('@playwright/test');
  } catch {
    return { package: 'missing', executablePath: null };
  }
  try {
    return { package: 'present', executablePath: playwright.chromium.executablePath() };
  } catch {
    return { package: 'present', executablePath: null };
  }
}

/**
 * Report the host's evidence-capture readiness.
 *
 * `resolveManaged` and `exists` are injected so the detection path can be
 * tested against a host that has a browser and one that does not, without
 * either case depending on what the machine running the test happens to carry.
 */
export async function evidenceBrowserStatus({ env = process.env, exists = fs.existsSync, resolveManaged = managedExecutablePath } = {}) {
  const declared = env[BROWSER_EXECUTABLE_VARIABLE];
  if (declared) {
    // A host that names its own browser is trusted about which one, never about
    // whether it is there.
    return exists(declared)
      ? { ready: true, source: 'declared', executablePath: declared, playwrightPackage: 'not-required', reason: null, remediation: null }
      : {
        ready: false,
        source: 'declared',
        executablePath: declared,
        playwrightPackage: 'not-required',
        reason: 'declared-browser-missing',
        remediation: `${BROWSER_EXECUTABLE_VARIABLE} points at ${declared}, which does not exist. Correct the path or unset it and run \`${INSTALL_COMMAND}\`.`,
      };
  }

  const managed = await resolveManaged();
  if (managed.package === 'missing') {
    return {
      ready: false,
      source: 'managed',
      executablePath: null,
      playwrightPackage: 'missing',
      reason: 'playwright-package-missing',
      remediation: 'Rendered evidence needs Playwright. Install the factory dependencies with `npm install`, then run `' + INSTALL_COMMAND + '`.',
    };
  }
  if (!managed.executablePath) {
    return {
      ready: false,
      source: 'managed',
      executablePath: null,
      playwrightPackage: 'present',
      reason: 'browser-path-unresolved',
      remediation: `Playwright is installed but cannot report a Chromium path. Run \`${INSTALL_COMMAND}\` as the user that runs the factory service.`,
    };
  }
  return exists(managed.executablePath)
    ? { ready: true, source: 'managed', executablePath: managed.executablePath, playwrightPackage: 'present', reason: null, remediation: null }
    : {
      ready: false,
      source: 'managed',
      executablePath: managed.executablePath,
      playwrightPackage: 'present',
      reason: 'browser-missing',
      // The package being present is why this is worth spelling out: the
      // import succeeds, so nothing else on the host looks wrong.
      remediation: `Playwright is installed but its Chromium is not at ${managed.executablePath}. Run \`${INSTALL_COMMAND}\` as the user that runs the factory service.`,
    };
}

/**
 * Whether this host claims to capture evidence.
 *
 * A developer machine and an ordinary CI run generate, verify and preview
 * without ever capturing, so a missing browser there is not a fault. A factory
 * host that serves the acceptance path is a different claim, and says so.
 */
export function claimsEvidenceCapability(env = process.env) {
  return env[EVIDENCE_CAPABILITY_VARIABLE] === 'required';
}

/** One line, whether the answer is good news or not. */
export function describeEvidenceBrowser(status) {
  if (status.ready) return `Rendered-evidence browser present (${status.source}): ${status.executablePath}`;
  return `Rendered-evidence browser unavailable (${status.reason}). ${status.remediation}`;
}
