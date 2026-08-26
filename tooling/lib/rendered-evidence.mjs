import { createHash } from 'node:crypto';

/**
 * Rendered evidence.
 *
 * The launch-readiness audit reads composed output and says so plainly: it
 * cannot see rendered pixels. This is the other half. It captures what a build
 * actually renders, from a real browser against a real preview, and records it
 * as an artifact with an identity rather than as a folder of screenshots.
 *
 * Two rules keep it honest.
 *
 * A capture is visual evidence and nothing else. It can show what a state looks
 * like; it can never show that a journey completes. A picture of an enquiry
 * form is not proof that an enquiry arrives.
 *
 * Coverage is stated, not implied. Every state the deterministic state matrix
 * names either has a capture or appears in `uncovered` with the reason. A
 * screenshot set that quietly omits the states it cannot reach reads as
 * complete when it is not.
 */

// The same widths the Console previews at, so evidence and the preview someone
// reviewed are the same rendering rather than two nearby ones.
export const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 }),
  Object.freeze({ name: 'tablet', width: 768, height: 1024, deviceScaleFactor: 1 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 }),
]);

/**
 * Interactions a capture may perform, as a closed registry.
 *
 * A capture step is not a place for arbitrary scripting. Each entry names a
 * state worth seeing, the section type that has to be present for it to exist,
 * and what the resulting picture is and is not evidence of.
 */
export const INTERACTIONS = Object.freeze({
  'enquiry-submit-failed': Object.freeze({
    requiresSectionType: 'enquiry-form',
    axis: 'write',
    state: 'failed',
    risk: 'high',
    proves: 'How the enquiry form reports a failed submission. It is not evidence that a successful submission works.',
    // What the capture must actually see before it may claim this state.
    //
    // The Phase 3.8E nbm run published a picture labelled write/failed that
    // showed "Thanks — your enquiry has been sent.": the capture waited for the
    // form to settle either way and then photographed whichever outcome it got.
    // A capture that can assert a state it did not reach is worse than no
    // capture, so `settled` says when to look and `reached` says what has to be
    // there.
    outcome: Object.freeze({
      selector: '.enquiry-actions p',
      settled: /could not send|Thanks/i,
      reached: /could not send/i,
      // How the failure is caused, deterministically. Waiting for a submission
      // to fail by itself is not a method: under a dev preview the POST
      // succeeds, so the state was never reachable and the capture published
      // the success message instead. Failing the request makes the state real
      // on any host.
      failRequest: '**/__forms.html',
    }),
  }),
});

const VIEWPORT_NAMES = new Set(VIEWPORTS.map((viewport) => viewport.name));
const list = (value) => (Array.isArray(value) ? value : []);

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}

function slug(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function captureId({ pageId, viewport, axis, state }) {
  return [pageId, viewport, slug(axis), slug(state)].filter(Boolean).join('--');
}

export function captureFile(id) {
  return `captures/${id}.png`;
}

/**
 * Why a state matrix entry cannot be answered by a picture.
 *
 * `viewport` is the one axis a capture settles outright: rendering the page at
 * that width is the evidence. A `write` state is behaviour, so no capture can
 * establish it — except the failure appearance, which the interaction registry
 * reaches deliberately. `data` and `content` states describe content the build
 * does not contain, so proving them needs a fixture that does not exist yet;
 * that is a gap in the factory's evidence rather than something to fake.
 */
function uncoveredReason(axis, state) {
  if (axis === 'write') {
    return state === 'failed'
      ? { reason: 'capability-not-installed', detail: 'No enquiry-form section renders on this route, so its failure state does not exist here.' }
      : { reason: 'not-visually-provable', detail: `A capture cannot establish that a write ${state === 'succeeded' ? 'succeeds' : state === 'submitting' ? 'is in flight' : 'is idle'}; that needs executable journey evidence.` };
  }
  if (axis === 'data') return { reason: 'needs-a-deterministic-fixture', detail: `Rendering the ${state} data state needs a fixture composition; the build carries its real content.` };
  if (axis === 'content') return { reason: 'needs-a-deterministic-fixture', detail: `Rendering the ${state} content state needs a fixture composition; the build carries its real content.` };
  return { reason: 'needs-a-deterministic-fixture', detail: `No deterministic way to reach the ${axis} ${state} state yet.` };
}

/**
 * Turn the deterministic state matrix into a capture plan.
 *
 * The state matrix is Phase 3.8K's and is not re-derived here: this decides
 * only which of its states a browser can be pointed at, and says why for the
 * rest.
 */
export function deriveEvidencePlan({ composition, stateMatrix, viewports = VIEWPORTS, elementIdentity = null } = {}) {
  if (!composition?.pages?.length) throw new Error('A composition with pages is required to plan rendered evidence.');
  const names = viewports.map((viewport) => viewport.name);
  for (const name of names) if (!VIEWPORT_NAMES.has(name)) throw new Error(`Unknown evidence viewport: ${name}`);

  const surfaceByRoute = new Map(list(stateMatrix).map((surface) => [surface.page, surface]));
  const captures = [];
  const uncovered = [];

  for (const page of composition.pages) {
    const sections = composition.sections.filter((section) => list(page.sectionIds).includes(section.id));
    const refs = elementIdentity
      ? elementIdentity.elements.filter((element) => element.pageId === page.id).map((element) => element.ref)
      : [];

    for (const viewport of viewports) {
      captures.push({
        id: captureId({ pageId: page.id, viewport: viewport.name, axis: 'viewport', state: viewport.name }),
        pageId: page.id,
        route: page.path,
        viewport: viewport.name,
        state: {
          axis: 'viewport',
          state: viewport.name,
          risk: viewport.name === 'mobile' ? 'high' : 'low',
          interaction: null,
          proves: `How ${page.path} renders at ${viewport.width}px. It is not evidence that anything on the page works.`,
        },
        elementRefs: refs,
      });
    }

    for (const [name, interaction] of Object.entries(INTERACTIONS)) {
      if (!sections.some((section) => section.type === interaction.requiresSectionType)) continue;
      for (const viewport of viewports) {
        captures.push({
          id: captureId({ pageId: page.id, viewport: viewport.name, axis: interaction.axis, state: interaction.state }),
          pageId: page.id,
          route: page.path,
          viewport: viewport.name,
          state: { axis: interaction.axis, state: interaction.state, risk: interaction.risk, interaction: name, proves: interaction.proves },
          elementRefs: refs,
        });
      }
    }

    const surface = surfaceByRoute.get(page.path);
    for (const entry of list(surface?.states)) {
      if (entry.axis === 'viewport' && names.includes(entry.state)) continue;
      if (captures.some((capture) => capture.route === page.path && capture.state.axis === entry.axis && capture.state.state === entry.state)) continue;
      uncovered.push({ route: page.path, axis: entry.axis, state: entry.state, risk: entry.risk, ...uncoveredReason(entry.axis, entry.state) });
    }
  }

  return { viewports: viewports.map((viewport) => ({ ...viewport })), captures, uncovered };
}

/**
 * Assemble the durable record from a plan plus what was actually captured.
 *
 * A planned capture with no bytes is not recorded. Evidence that names a file
 * nobody produced is worse than evidence that admits a gap.
 */
export function buildEvidenceSet({ plan, results, projectId, buildRef, compositionHash, capturedAt, checkpointId = null, taskId = null } = {}) {
  if (!projectId || !buildRef || !compositionHash || !capturedAt) throw new Error('Rendered evidence needs a project, a build, a composition hash and a capture time.');
  const captured = new Map(list(results).map((result) => [result.id, result]));
  const captures = plan.captures
    .filter((capture) => captured.has(capture.id))
    .map((capture) => {
      const result = captured.get(capture.id);
      return {
        id: capture.id,
        evidenceKind: 'visual',
        pageId: capture.pageId,
        route: capture.route,
        viewport: capture.viewport,
        state: capture.state,
        file: captureFile(capture.id),
        contentHash: hash(result.bytes),
        byteSize: result.bytes.length,
        elementRefs: capture.elementRefs,
      };
    });

  const missed = plan.captures.filter((capture) => !captured.has(capture.id));
  const uncovered = [
    ...plan.uncovered,
    ...missed.map((capture) => ({
      route: capture.route,
      axis: capture.state.axis,
      state: capture.state.state,
      risk: capture.state.risk,
      reason: 'needs-a-deterministic-fixture',
      detail: 'Planned but not captured in this run.',
    })),
  ];

  const base = {
    schemaVersion: 1,
    id: `evidence-${hash({ projectId, buildRef, compositionHash, capturedAt }).slice(0, 16)}`,
    projectId,
    buildRef,
    checkpointId,
    taskId,
    compositionHash,
    capturedAt,
    viewports: plan.viewports,
    captures,
    uncovered,
  };
  return { ...base, setHash: hash(base) };
}

/**
 * Which state-matrix entries this evidence answers.
 *
 * Deliberately narrow. A capture raises a state's evidence only where the
 * picture is the proof; everything else keeps `evidence: 'none'` and waits for
 * executable evidence, which is a different artifact produced by a different
 * role.
 */
export function applyEvidenceToStateMatrix(stateMatrix, evidence) {
  const proven = new Set(list(evidence?.captures)
    .filter((capture) => capture.state.axis === 'viewport')
    .map((capture) => `${capture.route}::${capture.state.axis}::${capture.state.state}`));

  return list(stateMatrix).map((surface) => ({
    ...surface,
    states: list(surface.states).map((entry) => (
      proven.has(`${surface.page}::${entry.axis}::${entry.state}`) ? { ...entry, evidence: 'rendered' } : entry
    )),
  }));
}
