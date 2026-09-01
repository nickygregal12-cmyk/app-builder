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
    /**
     * A screen, not a document.
     *
     * Every other capture is `fullPage`, which is right for a page and wrong
     * for this one: the panel is anchored to the sticky header and overlays
     * whatever is beneath it, so a full-page image is the entire document with
     * a menu floating over the top of it — something no visitor ever sees.
     * Three independent reviews read exactly that picture as the navigation
     * clipping, obscuring and removing the page's introduction, and marked
     * responsive quality down for it. The panel covering the screen it was
     * opened over is the behaviour; the frame was the defect.
     */
    frame: 'viewport',
    proves: 'What the disclosed navigation panel looks like open, in the family this direction chose. It is not evidence that any destination in it resolves.',
    outcome: Object.freeze({
      control: '.site-header .nav-toggle',
      panel: '#primary-navigation',
      // The panel must report itself open before the picture counts, for the
      // same reason the enquiry capture checks its live region: a screenshot
      // taken after a click that did nothing asserts a state it never reached.
      reached: 'true',
    }),
    /**
     * The one interaction here whose quality is not in its endpoints.
     *
     * Five independent reviews of hand-built work capped `interaction-craft`
     * with a version of the same sentence — that transition quality, touch
     * behaviour and live-update smoothness could not be judged from stills —
     * and one of them said it while looking at eighteen separate state
     * captures. More endpoints do not answer it: the disclosure either slides
     * or it appears, and a picture of it shut followed by a picture of it open
     * is identical in both cases.
     *
     * So this declares that it needs temporal evidence, and nothing else does.
     * `requiresSectionType` already decides whether an interaction exists at
     * all from the composition; this decides whether the interaction's *worth*
     * lies in the movement between its states. Both are declarations. Neither
     * is inferred from a stylesheet, because "there is a transition property
     * here" is not the same claim as "a reviewer cannot judge this without
     * seeing it move", and only the second is a reason to spend three frames.
     */
    temporal: Object.freeze({
      purpose: 'Whether the panel arrives or is simply present — the disclosure carries the navigation on a phone, and how it enters is most of what makes it feel like a panel rather than a jump.',
      // Where in the movement to look, as a fraction of its own duration.
      // Halfway is the frame that distinguishes a slide from a cut; the
      // endpoints are identical either way.
      atProgress: 0.5,
    }),
  }),
});

/**
 * The three frames a temporal interaction produces, in order.
 *
 * Three because that is the smallest sequence that can carry a transition: the
 * state it left, the shape of the movement, and the state it reached. Two is a
 * pair of stills, which is what the harness already produced and what reviewers
 * said they could not judge from. More than three is a film, and nothing in the
 * record asks for one — the reviewers' complaint was never "not enough frames",
 * it was that the movement itself was absent.
 *
 * If an interaction ever genuinely needs a different representation, it should
 * say so and say why, rather than this becoming a frame count somebody tunes.
 */
export const SEQUENCE_FRAMES = Object.freeze(['before', 'during', 'after']);

const VIEWPORT_NAMES = new Set(VIEWPORTS.map((viewport) => viewport.name));
const list = (value) => (Array.isArray(value) ? value : []);

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}

function slug(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function captureId({ pageId, viewport, axis, state, frame = null }) {
  return [pageId, viewport, slug(axis), slug(state), frame ? slug(frame) : null].filter(Boolean).join('--');
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
        /*
         * The still. Captured with motion suppressed, as everything here always
         * has been, which makes it the reduced-motion counterpart rather than a
         * second thing to capture: `prefers-reduced-motion: reduce` is exactly
         * the condition under which a visitor sees this interaction arrive with
         * no movement, and that is what this picture is.
         */
        captures.push({
          id: captureId({ pageId: page.id, viewport: viewport.name, axis: interaction.axis, state: interaction.state }),
          pageId: page.id,
          route: page.path,
          viewport: viewport.name,
          state: {
            axis: interaction.axis,
            state: interaction.state,
            risk: interaction.risk,
            interaction: name,
            motion: 'reduced',
            proves: interaction.temporal
              ? `${interaction.proves} Captured under prefers-reduced-motion, so it is also evidence of what this interaction does for a visitor who has asked for no movement.`
              : interaction.proves,
          },
          elementRefs: refs,
        });

        if (!interaction.temporal) continue;
        for (const frame of SEQUENCE_FRAMES) {
          captures.push({
            id: captureId({ pageId: page.id, viewport: viewport.name, axis: interaction.axis, state: interaction.state, frame }),
            pageId: page.id,
            route: page.path,
            viewport: viewport.name,
            state: {
              axis: interaction.axis,
              state: interaction.state,
              risk: interaction.risk,
              interaction: name,
              motion: 'allowed',
              sequence: { id: `${page.id}--${viewport.name}--${slug(interaction.axis)}--${slug(interaction.state)}`, frame, atProgress: interaction.temporal.atProgress, purpose: interaction.temporal.purpose },
              proves: frame === 'during'
                ? `The shape of the movement ${interaction.axis} ${interaction.state} makes, seeked to ${Math.round(interaction.temporal.atProgress * 100)}% of its own duration. It is not evidence of how long it takes.`
                : `The ${frame === 'before' ? 'state this interaction leaves' : 'state it reaches'}, with motion allowed, so the middle frame has two endpoints to be read between.`,
            },
            elementRefs: refs,
          });
        }
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

  /*
   * A declared interaction that did not capture is a failure, not a gap.
   *
   * Everything the plan derives from the state matrix may legitimately end up
   * uncovered: those are states the factory cannot reach yet, and saying so is
   * the honest answer. An interaction is different. It is in a closed registry,
   * its precondition was checked against the composition before it was planned,
   * and it reaches its state through a scripted route that asserts it arrived.
   * If one of those does not produce bytes, something broke — the control moved,
   * the selector went stale, the build stopped shipping the behaviour — and
   * recording it as "needs a deterministic fixture" files a regression under the
   * same heading as work that was never done.
   *
   * That is not hypothetical. Fourteen of fifteen interaction states went
   * missing from one hand-built packet through a single wrong manifest key, no
   * error was raised, and the reviewer scored interaction-craft on what was
   * left. Silence is the failure mode this whole module was built to remove, and
   * it had survived here.
   *
   * A temporal sequence is stricter again: it is only evidence as a sequence. A
   * during-frame with no before is not a weaker version of a transition, it is a
   * still that reads as one.
   */
  /*
   * Checked before the general interaction rule below, because every sequence
   * frame is also an interaction capture and the general rule would otherwise
   * answer first with the less useful sentence. Which frames are missing, and
   * why a partial sequence is worse than none, is the thing worth saying.
   */
  const bySequence = new Map();
  for (const capture of plan.captures) {
    const id = capture.state.sequence?.id;
    if (!id) continue;
    if (!bySequence.has(id)) bySequence.set(id, []);
    bySequence.get(id).push(capture);
  }
  for (const [id, frames] of bySequence) {
    const present = frames.filter((capture) => captured.has(capture.id));
    if (present.length === frames.length) continue;
    const absent = frames.filter((capture) => !captured.has(capture.id)).map((capture) => capture.state.sequence.frame);
    throw new Error(
      `Temporal sequence ${id} is missing its ${absent.join(' and ')} frame(s). A sequence is evidence as a sequence: `
      + 'a during-frame without its endpoints is a still that reads as a transition, which is worse than no temporal evidence at all.',
    );
  }

  const missedInteractions = missed.filter((capture) => capture.state.interaction);
  if (missedInteractions.length) {
    const first = missedInteractions[0];
    throw new Error(
      `Rendered evidence is incomplete: ${missedInteractions.length} declared interaction capture(s) produced no bytes. `
      + `${first.id} (${first.state.interaction} on ${first.route} at ${first.viewport}) was planned because the composition contains what it needs, and did not capture. `
      + 'A declared interaction that silently becomes uncovered files a regression as an unmet fixture need.',
    );
  }

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

  /*
   * Every route the composition declares was photographed at least once.
   *
   * The per-capture identity assertion already proves a picture is of the page
   * it names. It cannot prove the set covers the site: a route dropped before
   * the browser opened leaves no failed capture to notice, and the set that
   * results is internally consistent and silently partial.
   */
  if (composition) {
    const declaredRoutes = list(composition.pages).map((page) => page.path);
    const capturedRoutes = new Set(captures.map((capture) => capture.route));
    const absent = declaredRoutes.filter((route) => !capturedRoutes.has(route));
    if (absent.length) {
      throw new Error(
        `Rendered evidence covers ${capturedRoutes.size} of ${declaredRoutes.length} declared routes. Missing: ${absent.join(', ')}. `
        + 'A set that omits a route reads as complete evidence for a smaller site.',
      );
    }
  }

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
