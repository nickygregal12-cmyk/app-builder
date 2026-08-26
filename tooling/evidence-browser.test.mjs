import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_EXECUTABLE_VARIABLE,
  EVIDENCE_CAPABILITY_VARIABLE,
  INSTALL_COMMAND,
  claimsEvidenceCapability,
  describeEvidenceBrowser,
  evidenceBrowserStatus,
} from './lib/evidence-browser.mjs';
import { captureEvidence } from './lib/rendered-evidence-capture.mjs';

// Nothing here launches or downloads a browser. Both hosts — the one that has
// Chromium and the one that does not — are described to the detector, so an
// ordinary test run proves the detection without fetching 150MB to do it.
const hostWith = (present) => (candidate) => present.includes(candidate);

function managed(executablePath, packageState = 'present') {
  return async () => ({ package: packageState, executablePath });
}

test('a host that names its own browser is trusted about which one, not about whether it is there', async () => {
  const present = await evidenceBrowserStatus({
    env: { [BROWSER_EXECUTABLE_VARIABLE]: '/opt/browsers/chromium' },
    exists: hostWith(['/opt/browsers/chromium']),
  });
  assert.equal(present.ready, true);
  assert.equal(present.source, 'declared');
  assert.equal(present.executablePath, '/opt/browsers/chromium');
  assert.equal(present.remediation, null);

  const absent = await evidenceBrowserStatus({
    env: { [BROWSER_EXECUTABLE_VARIABLE]: '/opt/browsers/chromium' },
    exists: hostWith([]),
  });
  assert.equal(absent.ready, false);
  assert.equal(absent.reason, 'declared-browser-missing');
  assert.match(absent.remediation, /\/opt\/browsers\/chromium/, 'the remediation must name the path that is wrong');
});

test('the Playwright package being installed is told apart from its browser being installed', async () => {
  // This is the state the Phase 3.8E host was in: the import succeeds, so
  // nothing else on the machine looks wrong, and capture still cannot run.
  const packagedButUnprovisioned = await evidenceBrowserStatus({
    env: {},
    exists: hostWith([]),
    resolveManaged: managed('/home/appbuilder/.cache/ms-playwright/chromium-1234/chrome'),
  });
  assert.equal(packagedButUnprovisioned.ready, false);
  assert.equal(packagedButUnprovisioned.playwrightPackage, 'present');
  assert.equal(packagedButUnprovisioned.reason, 'browser-missing');
  assert.ok(packagedButUnprovisioned.remediation.includes(INSTALL_COMMAND), 'the remediation must be the exact command that fixes it');
  assert.match(packagedButUnprovisioned.remediation, /user that runs the factory service/, 'installing it for the wrong user is the failure this reports');

  const noPackage = await evidenceBrowserStatus({ env: {}, exists: hostWith([]), resolveManaged: managed(null, 'missing') });
  assert.equal(noPackage.playwrightPackage, 'missing');
  assert.equal(noPackage.reason, 'playwright-package-missing');

  const unresolved = await evidenceBrowserStatus({ env: {}, exists: hostWith([]), resolveManaged: managed(null) });
  assert.equal(unresolved.reason, 'browser-path-unresolved');

  const ready = await evidenceBrowserStatus({
    env: {},
    exists: hostWith(['/home/appbuilder/.cache/ms-playwright/chromium-1234/chrome']),
    resolveManaged: managed('/home/appbuilder/.cache/ms-playwright/chromium-1234/chrome'),
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.source, 'managed');
  assert.equal(describeEvidenceBrowser(ready), 'Rendered-evidence browser present (managed): /home/appbuilder/.cache/ms-playwright/chromium-1234/chrome');
});

test('only a host that claims rendered-evidence capability fails for a missing browser', () => {
  assert.equal(claimsEvidenceCapability({ [EVIDENCE_CAPABILITY_VARIABLE]: 'required' }), true);
  // A developer machine and an ordinary CI run generate, verify and preview
  // without ever capturing, so a missing browser there is not a fault.
  assert.equal(claimsEvidenceCapability({}), false);
  assert.equal(claimsEvidenceCapability({ [EVIDENCE_CAPABILITY_VARIABLE]: 'optional' }), false);
  assert.equal(claimsEvidenceCapability({ [EVIDENCE_CAPABILITY_VARIABLE]: 'true' }), false);
});

test('capture refuses before it opens anything when the host has no browser', async () => {
  const plan = { viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }], captures: [{ id: 'capture-home', route: '/', viewport: 'desktop', state: {} }] };
  await assert.rejects(
    () => captureEvidence({ plan, baseUrl: 'http://127.0.0.1:4173/preview/project/', env: { [BROWSER_EXECUTABLE_VARIABLE]: '/definitely/not/a/browser' } }),
    (error) => {
      assert.match(error.message, /Rendered-evidence browser unavailable/);
      assert.match(error.message, /\/definitely\/not\/a\/browser/);
      return true;
    },
  );

  // A plan with nothing to capture still needs no browser.
  const empty = await captureEvidence({ plan: { viewports: [], captures: [] }, baseUrl: 'http://127.0.0.1:4173/', env: {} });
  assert.deepEqual(empty, { results: [], failures: [] });
});
