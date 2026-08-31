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
  Object.freeze({ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }),
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
  /**
   * The navigation, open.
   *
   * Every capture in every set photographed the header closed, so the panel a
   * phone visitor actually navigates by had never been seen by a reviewer. The
   * seventh independent review asked for it in those words: "provide visual
   * evidence of the opened mobile navigation state before treating responsive
   * navigation as complete." It was a fair objection — the disclosure is where
   * four navigation families each have to keep their own character, and the
   * only proof of that was the stylesheet.
   *
   * `requiresSectionType` is null because the header is not a section: it is on
   * every route, so this is the first interaction that qualifies by viewport
   * rather than by content. Mobile only, because above the disclosure width
   * there is no panel to open and a picture of a bar that never collapsed
   * would be evidence of nothing.
   */
  'navigation-disclosed': Object.freeze({
    requiresSectionType: null,
    viewports: Object.freeze(['mobile']),
    axis: 'navigation',
    state: 'open',
    risk: 'high',
    proves: 'What the disclosed navigation panel looks like open, in the family this direction chose. It is not evidence that any destination in it resolves.',
    outcome: Object.freeze({
      control: '.site-header .nav-toggle',
      panel: '#primary-navigation',
      // The panel must report itself open before the picture counts, for the
      // same reason the enquiry capture checks its live region: a screenshot
      // taken after a click that did nothing asserts a state it never reached.
      reached: 'true',
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
      // A null requirement means the surface is on every route rather than in
      // a section — the header is the first of those.
      if (interaction.requiresSectionType && !sections.some((section) => section.type === interaction.requiresSectionType)) continue;
      const scoped = interaction.viewports
        ? viewports.filter((viewport) => interaction.viewports.includes(viewport.name))
        : viewports;
      for (const viewport of scoped) {
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
/**
 * Routes the composition says differ, photographed identically.
 *
 * The nbm candidate sets were captured across six routes and produced six
 * byte-identical PNGs per viewport. The packet recorded six identical content
 * hashes, the run reported complete evidence, and a reviewer was handed
 * eighteen pictures of what were really three. Nothing compared them, because
 * nothing had ever been asked to.
 *
 * This is deliberately not "all captures must be unique". Two pages built from
 * the same sections *should* render alike, and calling that a defect would
 * teach everyone to ignore the check. The question is narrower and answerable
 * from the composition alone: pages whose section sets differ cannot legitimately
 * produce the same pixels, so when they do, the capture did not photograph what
 * it says it did.
 *
 * Comparison is within a viewport and interaction state, so a desktop capture is
 * never compared against a phone one.
 */
export function findDegenerateRouteCaptures({ composition, captures } = {}) {
  const sectionsFor = new Map(list(composition?.pages).map((page) => [page.id, [...list(page.sectionIds)].sort().join(' ')]));
  const groups = new Map();
  for (const capture of list(captures)) {
    const key = `${capture.viewport} ${capture.state?.axis ?? ''} ${capture.state?.state ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(capture);
  }

  const findings = [];
  for (const [, group] of groups) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        if (a.pageId === b.pageId) continue;
        if (a.contentHash !== b.contentHash) continue;
        // Same pixels is only a defect when the composition promised otherwise.
        if (sectionsFor.get(a.pageId) === sectionsFor.get(b.pageId)) continue;
        findings.push({
          viewport: a.viewport,
          routes: [a.route, b.route].sort(),
          pageIds: [a.pageId, b.pageId].sort(),
          contentHash: a.contentHash,
          detail: `${a.route} and ${b.route} are composed from different sections but rendered byte-identically at ${a.viewport}.`,
        });
      }
    }
  }
  return findings;
}

export function buildEvidenceSet({ plan, results, projectId, buildRef, compositionHash, capturedAt, renderingSource, checkpointId = null, taskId = null, designLint = null, composition = null } = {}) {
  if (!projectId || !buildRef || !compositionHash || !capturedAt) throw new Error('Rendered evidence needs a project, a build, a composition hash and a capture time.');
  // What was serving is not optional and has no default. A default would be a
  // guess, and the only two guesses available are "development" — which would
  // quietly refuse honest built-artifact evidence — and "built-artifact", which
  // would let a development capture claim to depict what ships. That second
  // mistake is the one that has already cost a paid review, twice.
  if (!renderingSource?.serverMode) {
    throw new Error('Rendered evidence must record what was serving when it was captured. A capture that cannot say which artifact it photographed is not evidence about a build.');
  }
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

  // Fail closed before the record exists. Evidence that silently collapses six
  // routes into one picture is worse than a failed capture, because a failed
  // capture stops and this ships to a reviewer looking complete.
  if (composition) {
    const degenerate = findDegenerateRouteCaptures({ composition, captures });
    if (degenerate.length) {
      throw new Error(
        `Rendered evidence is degenerate: ${degenerate.length} route pair(s) that the composition builds from different sections were photographed byte-identically. `
        + `${degenerate[0].detail} This is a failed capture, not evidence — the browser did not render the route it was sent to, or the build does not serve it.`,
      );
    }
  }

  const base = {
    schemaVersion: 1,
    id: `evidence-${hash({ projectId, buildRef, compositionHash, capturedAt }).slice(0, 16)}`,
    projectId,
    buildRef,
    checkpointId,
    taskId,
    compositionHash,
    capturedAt,
    // Part of `base`, so it is inside `setHash`. Evidence whose identity did not
    // cover what was serving could have its rendering source rewritten without
    // the set noticing.
    renderingSource,
    viewports: plan.viewports,
    captures,
    uncovered,
    // What the rules already settled, travelling with the pictures. A reviewer
    // — or a visual critic — should not have to re-derive a contrast failure
    // from a screenshot when a rule decided it before the browser opened.
    designLint,
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
