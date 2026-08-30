/**
 * What the browser itself reported while a journey ran.
 *
 * The generated-application journeys assert what is on the screen. Nothing in
 * them asks the browser what it thought of the trip, so a journey can throw an
 * uncaught exception, log an error, lose a request and take a 500 from the API
 * and still finish green: every locator it names is still there, because a
 * React error inside a component that already rendered does not remove the
 * markup the assertions look at.
 *
 * This module is the missing question. It classifies the four things a browser
 * can report that a locator cannot see:
 *
 *   - `page-error`     an uncaught exception reached the page;
 *   - `console-error`  the application or a library reported an error;
 *   - `request-failed` a request produced no response at all;
 *   - `http-error`     a response came back at 400 or worse.
 *
 * ## Declarations, and why they are data
 *
 * Some of those are the harness rather than the product: Chromium asks every
 * navigation for `/favicon.ico`, and a page that reloads cancels whatever was
 * in flight. Suppressing them needs a mechanism, and the obvious mechanism —
 * a predicate function per exception — cannot be published. A reviewer handed
 * a screenshot and told "nothing unexpected happened" is being asked to trust
 * a filter they cannot read.
 *
 * So a declaration is plain data with a written reason, it travels into the
 * evidence beside the signals it excused, and every signal it excused is still
 * recorded. The gate narrows; the record does not.
 *
 * ## What cannot be declared away
 *
 * `page-error` has no entry here and cannot be given one: `declarableKinds`
 * refuses it structurally rather than by convention. An uncaught exception is
 * never the harness's doing, and an allowlist that can reach it is an allowlist
 * that will eventually be used to silence a real defect at 5pm.
 */

/** Every kind of signal this module knows how to classify. */
export const SIGNAL_KINDS = Object.freeze(['page-error', 'console-error', 'request-failed', 'http-error']);

/**
 * Kinds a declaration may excuse.
 *
 * The absence of `page-error` is the load-bearing part of this file. It is a
 * separate constant rather than a filter inside the matcher so that a change to
 * it is a visible change to a named contract with a test on it.
 */
export const DECLARABLE_KINDS = Object.freeze(['console-error', 'request-failed', 'http-error']);

/** A signal that failed the journey, one that a declaration excused, and one nobody gates. */
export const DISPOSITIONS = Object.freeze(['gated', 'declared', 'observed']);

/**
 * Signals this lane's own machinery produces, excused once and centrally.
 *
 * Each entry is here because the dev server or the harness caused it, not the
 * product — and each is also a small reminder of why this lane's evidence is
 * local-browser evidence rather than evidence about a deployed artifact. A
 * built artifact behind a real host has none of these behaviours: it does not
 * re-optimise dependencies mid-session, and it is not being driven by a
 * harness that cancels navigations.
 */
export const HARNESS_DECLARATIONS = Object.freeze([
  Object.freeze({
    id: 'favicon-not-served',
    kinds: Object.freeze(['http-error']),
    match: Object.freeze({ url: '/favicon\\.ico(\\?|$)', status: Object.freeze([404]) }),
    because:
      'Chromium requests an icon on every navigation and the generated template declares none, so the dev server answers 404. '
      + 'It is a fact about a file the product does not have rather than a failure in a journey, and it is recorded so that a '
      + 'reviewer who thinks the product should have one can still see it.',
  }),
  Object.freeze({
    id: 'navigation-cancelled-request',
    kinds: Object.freeze(['request-failed']),
    match: Object.freeze({ failure: '^net::ERR_ABORTED$' }),
    because:
      'A request in flight when the harness calls goto() or reload() is cancelled by that navigation. The journeys reload '
      + 'deliberately — it is how they prove a write reached the database rather than React — so this is the harness\'s own '
      + 'doing. Any other failure text is a request that genuinely never arrived, and stays gated.',
  }),
  Object.freeze({
    id: 'supabase-local-jwt-clock-skew',
    kinds: Object.freeze(['http-error']),
    match: Object.freeze({ status: Object.freeze([401]), body: '"code":"PGRST303"' }),
    because:
      'PostgREST rejecting a token GoTrue minted a moment earlier, with "JWT issued at future". The two run as separate '
      + 'containers in the local acceptance stack and PostgREST allows no leeway on `iat`, so a sub-second difference between '
      + 'their clocks refuses a perfectly valid session. The application cannot cause it — it mints no tokens and sets no '
      + 'claims — and it is intermittent, which is what a clock race looks like. It is matched on the PostgREST error code '
      + 'rather than on the status, so an ordinary 401 is still gated, and it stays counted in the evidence: if it starts '
      + 'happening on every run that is a stack to fix, not a line to keep excusing.',
  }),
  Object.freeze({
    id: 'resource-failure-console-duplicate',
    kinds: Object.freeze(['console-error']),
    match: Object.freeze({ text: '^Failed to load resource: (the server responded with a status of \\d+|net::)' }),
    because:
      'Chromium logs this line to the console for every request that failed, so one bad response arrives twice: once as the '
      + 'console message and once as the network signal. The network signal is the better of the two — it carries the method, '
      + 'the URL and the status, where the console line carries only the status — and it is still gated. Excusing the duplicate '
      + 'narrows nothing: a 500 from the API fails the journey through http-error either way. Not excusing it would, because a '
      + 'declaration written against a URL cannot match a console line that has none, so every declared network failure would '
      + 'still fail through its own echo.',
  }),
  Object.freeze({
    id: 'vite-dependency-reoptimisation',
    kinds: Object.freeze(['http-error']),
    match: Object.freeze({ url: '/(@vite/|@react-refresh|@fs/|node_modules/\\.vite/)', status: Object.freeze([504]) }),
    because:
      'The Vite dev server answers 504 "Outdated Optimize Dep" when it re-optimises dependencies, and reloads the page itself '
      + 'to recover. It is a development-server mechanism with no equivalent in a built artifact. Excusing it is one of the '
      + 'concrete reasons this lane cannot stand in for evidence about what ships.',
  }),
]);

/** Console levels worth keeping in the record without gating on them. */
const OBSERVED_CONSOLE_TYPES = Object.freeze(['warning']);

/**
 * How many signals one journey may record.
 *
 * A page stuck in a render loop can emit console errors faster than anything
 * will read them, and an evidence artifact nobody can open is not evidence. The
 * cap is stated in the record when it bites, because a silently truncated list
 * reads as a short one.
 */
export const SIGNAL_CAP = 200;

function matches(match, signal) {
  if (!match) return false;
  if (match.url !== undefined) {
    if (typeof signal.url !== 'string' || !new RegExp(match.url).test(signal.url)) return false;
  }
  if (match.status !== undefined) {
    if (!match.status.includes(signal.status)) return false;
  }
  if (match.failure !== undefined) {
    if (typeof signal.failure !== 'string' || !new RegExp(match.failure).test(signal.failure)) return false;
  }
  if (match.text !== undefined) {
    if (typeof signal.text !== 'string' || !new RegExp(match.text).test(signal.text)) return false;
  }
  // Matched as a plain substring rather than a pattern. What goes here is an
  // API's own error code, and a code is a literal; treating it as a regular
  // expression would make `.` in a code match anything and turn a narrow
  // declaration into a broad one by accident.
  if (match.body !== undefined) {
    if (typeof signal.body !== 'string' || !signal.body.includes(match.body)) return false;
  }
  return true;
}

/**
 * The declaration that excuses this signal, or null.
 *
 * A declaration naming an undeclarable kind does not quietly fail to match: it
 * throws, so a mistake surfaces where it was written rather than as a gate that
 * stopped catching something.
 */
export function findDeclaration(signal, declarations = []) {
  for (const declaration of declarations) {
    for (const kind of declaration.kinds ?? []) {
      if (!DECLARABLE_KINDS.includes(kind)) {
        throw new Error(
          `Declaration ${declaration.id} names kind "${kind}", which no declaration may excuse. `
          + `Declarable kinds are ${DECLARABLE_KINDS.join(', ')}.`,
        );
      }
    }
    if (!(declaration.kinds ?? []).includes(signal.kind)) continue;
    if (matches(declaration.match, signal)) return declaration;
  }
  return null;
}

/** `gated` unless a declaration excuses it, or it is a kind nobody gates. */
export function classifySignal(signal, declarations = []) {
  if (!SIGNAL_KINDS.includes(signal.kind)) return { disposition: 'observed', declaredBy: null };
  const declaration = findDeclaration(signal, declarations);
  if (declaration) return { disposition: 'declared', declaredBy: declaration.id, because: declaration.because };
  return { disposition: 'gated', declaredBy: null };
}

/**
 * Classify one journey's signals and say plainly whether it may pass.
 *
 * `unusedDeclarations` is reported rather than gated. A harness declaration
 * that did not fire means the dev server behaved well on this run, which is not
 * a defect; a journey-scoped declaration that did not fire means the journey
 * did not provoke the refusal it claimed, which is worth a reader's attention
 * and is why it is named rather than dropped.
 */
export function summariseJourneySignals(signals, declarations = []) {
  const kept = signals.slice(0, SIGNAL_CAP);
  const classified = kept.map((signal) => ({ ...signal, ...classifySignal(signal, declarations) }));
  const gated = classified.filter((entry) => entry.disposition === 'gated');
  const used = new Set(classified.map((entry) => entry.declaredBy).filter(Boolean));
  return {
    signals: classified,
    gated,
    counts: {
      gated: gated.length,
      declared: classified.filter((entry) => entry.disposition === 'declared').length,
      observed: classified.filter((entry) => entry.disposition === 'observed').length,
    },
    truncated: signals.length > SIGNAL_CAP ? { recorded: kept.length, emitted: signals.length } : null,
    unusedDeclarations: declarations.filter((declaration) => !used.has(declaration.id)).map((declaration) => declaration.id),
    clean: gated.length === 0,
  };
}

/** One line per gated signal, in the shape a failure message should read. */
export function describeGatedSignals(gated) {
  return gated.map((signal) => {
    switch (signal.kind) {
      case 'page-error':
        return `uncaught exception: ${signal.text}`;
      case 'console-error':
        return `console.error: ${signal.text}`;
      case 'request-failed':
        return `request never completed: ${signal.method} ${signal.url} (${signal.failure})`;
      case 'http-error':
        // With the body, because a status is not a diagnosis. The first hosted
        // run of this gate reported `HTTP 401` against a profile write and the
        // status alone read as a broken product; the body said `PGRST303 — JWT
        // issued at future`, which is two containers disagreeing about the time.
        return `HTTP ${signal.status}: ${signal.method} ${signal.url}${signal.body ? ` — ${signal.body}` : ''}`;
      default:
        return `${signal.kind}: ${signal.text ?? signal.url ?? ''}`;
    }
  });
}

/** Whether a console message is worth recording at all, and as what. */
export function consoleSignalKind(type) {
  if (type === 'error') return 'console-error';
  if (OBSERVED_CONSOLE_TYPES.includes(type)) return 'console-warning';
  return null;
}
