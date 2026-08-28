/**
 * Deterministic launch-readiness audit over composed product.
 *
 * Phase 3.8E asks a person to build a real business site, then count and categorise the meaningful
 * manual edits it took to reach launchable quality. That budget should be spent on judgement only a
 * person has — not on an empty hero, a dead link, placeholder copy or a missing contact route, all
 * of which a script can name first.
 *
 * So this predicts the edits. Every finding carries the same category vocabulary that
 * `schemas/genuine-business-acceptance.schema.json` uses for real edits, which makes predicted and
 * actual edits directly comparable and turns 3.8E into a measurable gate rather than an opinion.
 *
 * It reads composed output only. It cannot see rendered pixels and never claims a design is good;
 * that judgement stays with rendered evidence and the design critic.
 */

import { coverHardConstraints, coverageSummary } from './requirement-coverage.mjs';

const PLACEHOLDER =/\b(lorem ipsum|tbd|to be decided|coming soon|your company|your business|example\.com|placeholder|xxx+)\b/i;
const NOT_FOUND = /(^|\/)(404|not-found)$/;

/**
 * The section types a composition can actually contain.
 *
 * This mirrors the `type` enum in `schemas/section-spec.schema.json` and exists so the role sets
 * below can be checked against reality. Phase 4B kept shipping configuration that read well and
 * matched nothing; a role set naming `proof` or `testimonial` — types the composer cannot emit —
 * silently disables the rule that reads it. `launch-readiness.test.mjs` asserts this set equals the
 * schema enum, so drift fails the build instead of quietly switching a check off.
 */
export const SECTION_TYPES = Object.freeze([
  'hero', 'rich-text', 'item-grid', 'proof-grid', 'people-grid', 'location-list',
  'contact-panel', 'entity-list', 'content-list', 'cta', 'gallery', 'enquiry-form',
  'tenant-records', 'organisation-files', 'notifications',
]);

/**
 * Which section types play which role in an audit, read from the rule registry.
 *
 * Fails closed: a role naming a type no composition can contain is a configuration error, not a
 * check that quietly never fires.
 */
function sectionRoles(rules) {
  const configured = rules.sectionRoles;
  if (!configured) throw new Error('Launch readiness requires sectionRoles in the rule registry.');
  const roles = {};
  for (const [role, types] of Object.entries(configured)) {
    if (!Array.isArray(types) || types.length === 0) {
      throw new Error(`Launch-readiness section role "${role}" must list at least one section type.`);
    }
    for (const type of types) {
      if (!SECTION_TYPES.includes(type)) {
        throw new Error(`Launch-readiness section role "${role}" names unknown section type "${type}".`);
      }
    }
    roles[role] = new Set(types);
  }
  for (const required of ['visual', 'claim', 'conversion', 'capture', 'write', 'chrome']) {
    if (!roles[required]) throw new Error(`Launch-readiness section roles must include "${required}".`);
  }
  return roles;
}

/** Composer warnings are already deterministic signals; map the ones that predict a manual edit. */
const WARNING_CHECKS = {
  'missing-services': 'missing-services-content',
  'missing-contact-details': 'missing-contact-details',
  'no-publishable-imagery': 'no-publishable-imagery',
  'knowledge-pack-not-provided': 'knowledge-pack-not-provided',
};

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Flatten a binding value into the text a visitor would read.
 *
 * A binding is not always a string. `item-grid.items`, `location-list.items` and `proof-grid.items`
 * are arrays of records, and treating a non-string as "" reported every list in the build as an
 * empty hole while simultaneously hiding placeholder copy sitting inside those lists. The 3.8E NBM
 * run produced six blockers this way, all of them false, on lists that carried real content.
 */
export function bindingText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(bindingText).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(bindingText).filter(Boolean).join(' ');
  return '';
}

/** A binding renders a hole when nothing a visitor could read comes out of it. */
export function bindingIsEmpty(value) {
  return bindingText(value) === '';
}

function finding(rules, checkId, where, detail, extra = {}) {
  const rule = rules.checks[checkId];
  if (!rule) throw new Error(`Unknown launch-readiness check: ${checkId}`);
  return {
    check: checkId,
    category: rule.category,
    severity: rule.severity,
    owningRole: rule.owningRole,
    title: rule.title,
    guidance: rule.guidance,
    where,
    detail,
    ...extra,
  };
}

function auditContent(composition, rules, roles, findings) {
  const sectionsByPage = new Map();
  for (const page of list(composition.pages)) {
    sectionsByPage.set(
      page.id,
      list(composition.sections).filter((section) => list(page.sectionIds).includes(section.id)),
    );
  }

  for (const section of list(composition.sections)) {
    for (const binding of list(section.bindings)) {
      const value = bindingText(binding.value);
      if (value === '') {
        findings.push(finding(rules, 'unresolved-binding', `${section.id}.${binding.key}`,
          `Binding "${binding.key}" resolved to an empty value.`));
        continue;
      }
      if (PLACEHOLDER.test(value)) {
        findings.push(finding(rules, 'placeholder-copy', `${section.id}.${binding.key}`,
          `Binding "${binding.key}" still reads as placeholder text: ${JSON.stringify(value.slice(0, 80))}.`));
      }
      const unsourced = list(binding.sourceIds).length === 0 && list(binding.factIds).length === 0;
      if (binding.generated === true && unsourced && roles.claim.has(section.type)) {
        findings.push(finding(rules, 'generated-claim-without-source', `${section.id}.${binding.key}`,
          `Generated content sits in a ${section.type} section with no source or fact behind it.`));
      }
    }
    // A recovery surface is reached by accident and claims nothing; it does not
    // need a photograph.
    const onNotFound = list(composition.pages).some((page) => NOT_FOUND.test(page.path) && list(page.sectionIds).includes(section.id));
    if (!onNotFound && roles.visual.has(section.type) && list(section.assetIds).length === 0) {
      findings.push(finding(rules, 'section-expects-imagery', section.id,
        `A ${section.type} section has no asset bound to it.`));
    }
  }

  // A surface that exists only to hold a page title and a call to action is a dead end. The 3.8E
  // NBM run composed /projects and /careers this way — declared in intake, reachable from the main
  // navigation, and carrying nothing a visitor came for. Every binding on them resolved, so no
  // other check saw it.
  for (const page of list(composition.pages)) {
    if (NOT_FOUND.test(page.path)) continue;
    const sections = sectionsByPage.get(page.id) ?? [];
    if (sections.length === 0) continue;
    const substantive = sections.some((section) => {
      if (!roles.chrome.has(section.type)) return true;
      // A call to action is never the reason a visitor came. A hero earns its page only when it
      // says something beyond repeating the page title.
      if (section.type !== 'hero') return false;
      return list(section.bindings).some((binding) => binding.key !== 'title' && !bindingIsEmpty(binding.value));
    });
    if (!substantive) {
      findings.push(finding(rules, 'content-less-page', page.path,
        `Page "${page.path}" carries only ${sections.map((section) => section.type).join(' + ')} and no content a visitor came for.`));
    }
  }

  const titles = new Map();
  for (const page of list(composition.pages)) {
    if (text(page.purpose) === '') {
      findings.push(finding(rules, 'missing-page-purpose', page.path, `Page "${page.path}" states no purpose.`));
    }
    const title = text(page.title).toLowerCase();
    if (title !== '') titles.set(title, [...(titles.get(title) ?? []), page.path]);
  }
  for (const [title, paths] of titles) {
    if (paths.length > 1) {
      findings.push(finding(rules, 'duplicate-page-title', paths.join(', '),
        `${paths.length} pages share the title "${title}".`));
    }
  }
  return sectionsByPage;
}

function auditNavigation(composition, rules, roles, findings) {
  const pages = list(composition.pages);
  const paths = new Set(pages.map((page) => page.path));
  const linked = new Set();

  const actions = [
    ...pages.flatMap((page) => (page.primaryAction ? [{ owner: page.path, action: page.primaryAction }] : [])),
    ...list(composition.sections).flatMap((section) =>
      list(section.actions).map((action) => ({ owner: section.id, action }))),
  ];

  for (const { owner, action } of actions) {
    const href = text(action?.href);
    if (href === '') {
      findings.push(finding(rules, 'action-target-missing', owner,
        `Action "${text(action?.label) || 'unlabelled'}" has no target.`));
      continue;
    }
    if (!href.startsWith('/')) continue; // external links are not this audit's question
    const target = href.split(/[?#]/)[0].replace(/\/$/, '') || '/';
    if (!paths.has(target)) {
      findings.push(finding(rules, 'action-target-missing', owner,
        `Action "${text(action?.label) || 'unlabelled'}" points at ${href}, which no page serves.`));
      continue;
    }
    linked.add(target);
  }

  for (const page of pages) {
    // PageSpec navigation is { label, order, visible }. Reading the wrong field here turns every
    // navigable page into a false orphan, which is worse than not checking at all.
    const inNavigation = page.navigation?.visible === true;
    // A not-found route is deliberately absent from navigation and deliberately unlinked. Flagging
    // it as an orphan would contradict the rule immediately below, which requires it to exist.
    if (NOT_FOUND.test(page.path)) continue;
    if (!inNavigation && !linked.has(page.path) && page.path !== '/') {
      findings.push(finding(rules, 'orphan-page', page.path,
        `Page "${page.path}" is not in navigation and nothing links to it.`));
    }
  }

  if (!pages.some((page) => NOT_FOUND.test(page.path))) {
    findings.push(finding(rules, 'missing-not-found-route', 'routes',
      'No 404 or not-found route is composed.'));
  }

  const hasConversion = pages.some((page) => page.primaryAction)
    || list(composition.sections).some((section) => roles.conversion.has(section.type));
  if (!hasConversion) {
    findings.push(finding(rules, 'no-conversion-path', 'site',
      'No page declares a primary action and no enquiry, contact or call-to-action section exists.'));
  }
}

function auditWarnings(composition, rules, findings) {
  for (const warning of list(composition.warnings)) {
    const direct = WARNING_CHECKS[warning];
    if (direct) {
      findings.push(finding(rules, direct, 'composition', `Composer reported "${warning}".`));
      continue;
    }
    if (warning.startsWith('declared-proof-missing:')) {
      findings.push(finding(rules, 'declared-proof-missing', 'proof',
        `Intake declared "${warning.slice('declared-proof-missing:'.length)}" as available proof and no ingested source backs it.`));
    } else if (warning.startsWith('declared-conversion-unsupported:')) {
      findings.push(finding(rules, 'declared-conversion-unsupported', 'conversion',
        `Intake declared "${warning.slice('declared-conversion-unsupported:'.length)}" as a way to convert a visitor and nothing in the approved truth can back it.`));
    } else if (warning.startsWith('unfillable-surface:')) {
      findings.push(finding(rules, 'unfillable-surface', 'surfaces',
        `The factory proposed a "${warning.slice('unfillable-surface:'.length)}" surface and had no content to put on it, so it was not published.`));
    } else if (warning.startsWith('unresolved-capability:')) {
      findings.push(finding(rules, 'unresolved-capability', 'capabilities',
        `Requested capability "${warning.split(':')[1]}" has no ready implementation.`));
    } else if (warning.startsWith('custom-capability:')) {
      findings.push(finding(rules, 'custom-capability-pending', 'capabilities',
        `Capability "${warning.split(':')[1]}" is marked as custom work.`));
    }
  }
}

/**
 * Derive the state axes a surface genuinely exposes.
 *
 * Deliberately small: only axes the composed output can justify. A combinatorial catalogue of
 * fictional states is worse than none, because it makes missing evidence impossible to rank.
 */
export function deriveStateMatrix(composition, rules) {
  const roles = sectionRoles(rules);
  const surfaces = [];
  for (const page of list(composition.pages)) {
    const sections = list(composition.sections).filter((section) => list(page.sectionIds).includes(section.id));
    const bindings = sections.flatMap((section) => list(section.bindings));
    const writes = sections.filter((section) => roles.write.has(section.type));
    const sourceBacked = bindings.some((binding) => list(binding.sourceIds).length > 0 || list(binding.factIds).length > 0);

    const axes = [];
    if (bindings.length > 0) {
      // Content can be absent whenever it came from outside the template.
      const values = bindings.some((binding) => binding.origin !== 'default');
      axes.push({ axis: 'data', states: values ? ['loaded', 'empty'] : ['loaded'] });
    }
    if (writes.length > 0) {
      axes.push({ axis: 'write', states: ['idle', 'submitting', 'succeeded', 'failed'] });
    }
    if (sourceBacked) {
      axes.push({ axis: 'content', states: ['normal', 'long'] });
    }
    axes.push({ axis: 'viewport', states: ['mobile', 'desktop'] });

    const states = [];
    for (const axis of axes) {
      for (const state of axis.states) {
        // Rank by what a visitor is most likely to hit and most likely to be hurt by.
        const risk = axis.axis === 'write' && (state === 'failed' || state === 'submitting') ? 'high'
          : axis.axis === 'data' && state === 'empty' ? 'high'
            : axis.axis === 'viewport' && state === 'mobile' ? 'high'
              : state === 'long' ? 'medium'
                : 'low';
        states.push({ axis: axis.axis, state, risk, evidence: 'none' });
      }
    }
    surfaces.push({ page: page.path, axes: axes.map((axis) => axis.axis), states });
  }
  return surfaces;
}

/**
 * What kind of thing a primary action points at.
 *
 * `tel:`/`mailto:`/`sms:` are conversions in their own right, not routes; an absolute URL is off
 * this site. Only a path is a route this composition can be held to.
 */
export function actionTargetKind(href) {
  const value = text(href);
  if (value === '') return 'missing';
  if (/^(tel|mailto|sms):/i.test(value)) return 'direct-contact';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return 'external';
  return 'route';
}

function directContactChannel(href) {
  const scheme = text(href).split(':')[0].toLowerCase();
  return scheme === 'mailto' ? 'Email' : scheme === 'sms' ? 'Text message' : 'Call';
}

function slugForTarget(kind, href, targetPath) {
  if (kind === 'route') return targetPath.replace(/\//g, '') || 'home';
  const scheme = text(href).split(':')[0].toLowerCase();
  return kind === 'direct-contact' ? scheme : 'external';
}

/**
 * Derive journeys from composed output rather than from a manifest field that may be absent, then
 * check each step against what composition can actually prove.
 */
export function deriveJourneys(composition, rules) {
  const roles = sectionRoles(rules);
  const pages = list(composition.pages);
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const journeys = [];

  for (const page of pages) {
    const action = page.primaryAction;
    if (!action) continue;
    // A not-found page is where a journey goes wrong, not where one starts.
    if (NOT_FOUND.test(page.path)) continue;
    const href = text(action.href);
    const kind = actionTargetKind(href);
    const targetPath = href.split(/[?#]/)[0].replace(/\/$/, '') || '/';
    const target = kind === 'route' ? byPath.get(targetPath) : null;
    const targetSections = target
      ? list(composition.sections).filter((section) => list(target.sectionIds).includes(section.id))
      : [];
    const writeSection = targetSections.find((section) => roles.capture.has(section.type));

    const discovery = (() => {
      const reachable = page.navigation?.visible === true || page.path === '/';
      return {
        step: 'discovery',
        status: reachable ? 'proven' : 'unproven',
        detail: reachable
          ? `Entry page ${page.path} is reachable from navigation.`
          : `Entry page ${page.path} is not in navigation, so the journey has no discoverable start.`,
      };
    })();
    const primaryAction = {
      step: 'primary-action',
      status: text(action.label) ? 'proven' : 'unproven',
      detail: text(action.label)
        ? `Primary action "${text(action.label)}" is present.`
        : 'The primary action has no label, so nothing invites the visitor to act.',
    };

    const id = `${page.path === '/' ? 'home' : page.path.replace(/\//g, '')}-to-${slugForTarget(kind, href, targetPath)}`;

    // A phone or email action leaves the site entirely. Its destination is the visitor's dialler or
    // mail client and the call itself is the capture, so demanding a page that "serves"
    // tel:01413331836 — and then a form on that page — invents two defects per page that no edit
    // could ever fix. The 3.8E NBM run produced fourteen of them across seven pages.
    if (kind === 'direct-contact') {
      journeys.push({
        id,
        entry: page.path,
        steps: [
          discovery,
          primaryAction,
          { step: 'destination', status: 'proven',
            detail: `${directContactChannel(href)} action hands the visitor to their own ${directContactChannel(href) === 'Email' ? 'mail client' : 'dialler'}.` },
          { step: 'capture', status: 'proven',
            detail: 'The call or email is the capture; there is no on-site surface to prove.' },
        ],
      });
      continue;
    }

    // An off-site destination cannot be proven from this repository's composition at all. Reporting
    // it as a missing page would be wrong; reporting nothing would hide it.
    if (kind === 'external') {
      journeys.push({
        id,
        entry: page.path,
        steps: [
          discovery,
          primaryAction,
          { step: 'destination', status: 'needs-executable-evidence',
            detail: `Primary action leaves the site for ${href}; only a live check can prove it resolves.` },
        ],
      });
      continue;
    }

    journeys.push({
      id,
      entry: page.path,
      steps: [
        discovery,
        primaryAction,
        { step: 'destination', status: target ? 'proven' : 'unproven',
          detail: target ? `Resolves to ${targetPath}.` : `No page serves ${targetPath}.` },
        { step: 'capture', status: writeSection ? 'proven' : 'unproven',
          detail: writeSection ? `${writeSection.type} section captures the enquiry.` : 'No capture surface on the destination.' },
        { step: 'validation', status: 'needs-executable-evidence', detail: 'Composition cannot prove field validation.' },
        { step: 'success', status: 'needs-executable-evidence', detail: 'Composition cannot prove an observable success state.' },
        { step: 'failure', status: 'needs-executable-evidence', detail: 'Composition cannot prove a recoverable failure state.' },
      ],
    });
  }
  return journeys;
}

export function auditLaunchReadiness({ composition, rules, manifest = null, hardConstraintTopics = null } = {}) {
  if (!composition?.pages) throw new Error('Launch readiness requires a composition with pages.');
  if (!rules?.checks) throw new Error('Launch readiness requires a rule registry.');

  const findings = [];
  const roles = sectionRoles(rules);
  auditContent(composition, rules, roles, findings);
  auditNavigation(composition, rules, roles, findings);
  auditWarnings(composition, rules, findings);

  // Missing proof and a defect are different things. A high-risk state with no fixture is a gap in
  // the factory's evidence; it is not an edit a person makes to the site. Counting them together
  // would inflate the 3.8E manual-edit prediction into a number nobody could trust.
  const evidenceGaps = [];
  const stateMatrix = deriveStateMatrix(composition, rules);
  for (const surface of stateMatrix) {
    for (const state of surface.states) {
      if (state.risk === 'high' && state.evidence === 'none') {
        evidenceGaps.push(finding(rules, 'state-evidence-missing', surface.page,
          `The ${surface.page} "${state.state}" ${state.axis} state is high risk and has no evidence.`));
      }
    }
  }

  const journeys = deriveJourneys(composition, rules);
  for (const journey of journeys) {
    for (const step of journey.steps) {
      if (step.status === 'unproven') {
        // An unproven step is a real defect in composed output: the seam is genuinely absent.
        findings.push(finding(rules, 'journey-step-unproven', `${journey.id}:${step.step}`, step.detail));
      } else if (step.status === 'needs-executable-evidence') {
        evidenceGaps.push(finding(rules, 'journey-step-unproven', `${journey.id}:${step.step}`, step.detail));
      }
    }
  }

  // Hard constraints are read last, on purpose: a constraint is breached when a
  // check that binds it is already reporting, so this needs the findings the
  // rest of the audit produced rather than a second opinion about the same
  // composition.
  const hardConstraints = hardConstraintTopics
    ? coverHardConstraints({ manifest, topics: hardConstraintTopics.topics ?? hardConstraintTopics, findings })
    : [];
  for (const entry of hardConstraints) {
    if (entry.status === 'breached') {
      findings.push(finding(rules, 'hard-constraint-breached', 'constraints',
        `The project declares "${entry.constraint}". ${entry.detail}`));
    } else if (entry.status === 'unclassified' || entry.status === 'unenforced') {
      evidenceGaps.push(finding(rules, 'hard-constraint-unenforced', 'constraints',
        `The project declares "${entry.constraint}". ${entry.detail}`));
    } else if (entry.status === 'needs-executable-evidence') {
      evidenceGaps.push(finding(rules, 'hard-constraint-unenforced', 'constraints',
        `The project declares "${entry.constraint}". ${entry.detail}`));
    }
  }

  const order = rules.severityOrder ?? ['minor', 'major', 'blocker'];
  findings.sort((a, b) => order.indexOf(b.severity) - order.indexOf(a.severity)
    || a.category.localeCompare(b.category) || a.check.localeCompare(b.check));

  evidenceGaps.sort((a, b) => a.where.localeCompare(b.where) || a.detail.localeCompare(b.detail));

  const counts = { blocker: 0, major: 0, minor: 0 };
  const byCategory = {};
  for (const item of findings) {
    counts[item.severity] = (counts[item.severity] ?? 0) + 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    projectType: composition.projectType ?? null,
    compositionHash: composition.compositionHash ?? null,
    manifestVersion: manifest?.schemaVersion ?? composition.input?.manifestVersion ?? null,
    launchable: counts.blocker === 0,
    // Only defects predict an edit. Blockers and majors are what a reviewer would actually change.
    predictedManualEdits: counts.blocker + counts.major,
    summary: { ...counts, byCategory, evidenceGaps: evidenceGaps.length, hardConstraints: coverageSummary(hardConstraints) },
    findings,
    evidenceGaps,
    stateMatrix,
    journeys,
    // The requirement-coverage ledger for this build. It is reported whole
    // rather than only as findings, because "two of your four constraints are
    // enforced and here is what enforces them" is the answer, and a list of
    // complaints is only half of it.
    hardConstraints,
  };
}
