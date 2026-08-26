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

const PLACEHOLDER = /\b(lorem ipsum|tbd|to be decided|coming soon|your company|your business|example\.com|placeholder|xxx+)\b/i;
const VISUAL_SECTIONS = new Set(['hero', 'gallery', 'feature', 'showcase', 'proof', 'testimonial']);
const CLAIM_SECTIONS = new Set(['proof', 'stats', 'testimonial', 'trust', 'pricing', 'faq']);
const CONVERSION_SECTIONS = new Set(['enquiry-form', 'contact', 'cta', 'lead-form', 'booking']);
const NOT_FOUND = /(^|\/)(404|not-found)$/;

/** Composer warnings are already deterministic signals; map the ones that predict a manual edit. */
const WARNING_CHECKS = {
  'missing-services': 'missing-services-content',
  'missing-contact-details': 'missing-contact-details',
  'no-publishable-imagery': 'no-publishable-imagery',
  'knowledge-pack-not-provided': 'knowledge-pack-not-provided',
};

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

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

function auditContent(composition, rules, findings) {
  const sectionsByPage = new Map();
  for (const page of list(composition.pages)) {
    sectionsByPage.set(
      page.id,
      list(composition.sections).filter((section) => list(page.sectionIds).includes(section.id)),
    );
  }

  for (const section of list(composition.sections)) {
    for (const binding of list(section.bindings)) {
      const value = text(binding.value);
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
      if (binding.generated === true && unsourced && CLAIM_SECTIONS.has(section.type)) {
        findings.push(finding(rules, 'generated-claim-without-source', `${section.id}.${binding.key}`,
          `Generated content sits in a ${section.type} section with no source or fact behind it.`));
      }
    }
    if (VISUAL_SECTIONS.has(section.type) && list(section.assetIds).length === 0) {
      findings.push(finding(rules, 'section-expects-imagery', section.id,
        `A ${section.type} section has no asset bound to it.`));
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

function auditNavigation(composition, rules, findings) {
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
    || list(composition.sections).some((section) => CONVERSION_SECTIONS.has(section.type));
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
    if (warning.startsWith('unresolved-capability:')) {
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
export function deriveStateMatrix(composition) {
  const surfaces = [];
  for (const page of list(composition.pages)) {
    const sections = list(composition.sections).filter((section) => list(page.sectionIds).includes(section.id));
    const bindings = sections.flatMap((section) => list(section.bindings));
    const writes = sections.filter((section) => CONVERSION_SECTIONS.has(section.type));
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
 * Derive journeys from composed output rather than from a manifest field that may be absent, then
 * check each step against what composition can actually prove.
 */
export function deriveJourneys(composition) {
  const pages = list(composition.pages);
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const journeys = [];

  for (const page of pages) {
    const action = page.primaryAction;
    if (!action) continue;
    const targetPath = text(action.href).split(/[?#]/)[0].replace(/\/$/, '') || '/';
    const target = byPath.get(targetPath);
    const targetSections = target
      ? list(composition.sections).filter((section) => list(target.sectionIds).includes(section.id))
      : [];
    const writeSection = targetSections.find((section) => CONVERSION_SECTIONS.has(section.type));

    journeys.push({
      id: `${page.path === '/' ? 'home' : page.path.replace(/\//g, '')}-to-${targetPath.replace(/\//g, '') || 'home'}`,
      entry: page.path,
      steps: [
        (() => {
          const reachable = page.navigation?.visible === true || page.path === '/';
          return {
            step: 'discovery',
            status: reachable ? 'proven' : 'unproven',
            detail: reachable
              ? `Entry page ${page.path} is reachable from navigation.`
              : `Entry page ${page.path} is not in navigation, so the journey has no discoverable start.`,
          };
        })(),
        { step: 'primary-action', status: text(action.label) ? 'proven' : 'unproven',
          detail: text(action.label)
            ? `Primary action "${text(action.label)}" is present.`
            : 'The primary action has no label, so nothing invites the visitor to act.' },
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

export function auditLaunchReadiness({ composition, rules, manifest = null } = {}) {
  if (!composition?.pages) throw new Error('Launch readiness requires a composition with pages.');
  if (!rules?.checks) throw new Error('Launch readiness requires a rule registry.');

  const findings = [];
  auditContent(composition, rules, findings);
  auditNavigation(composition, rules, findings);
  auditWarnings(composition, rules, findings);

  // Missing proof and a defect are different things. A high-risk state with no fixture is a gap in
  // the factory's evidence; it is not an edit a person makes to the site. Counting them together
  // would inflate the 3.8E manual-edit prediction into a number nobody could trust.
  const evidenceGaps = [];
  const stateMatrix = deriveStateMatrix(composition);
  for (const surface of stateMatrix) {
    for (const state of surface.states) {
      if (state.risk === 'high' && state.evidence === 'none') {
        evidenceGaps.push(finding(rules, 'state-evidence-missing', surface.page,
          `The ${surface.page} "${state.state}" ${state.axis} state is high risk and has no evidence.`));
      }
    }
  }

  const journeys = deriveJourneys(composition);
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
    summary: { ...counts, byCategory, evidenceGaps: evidenceGaps.length },
    findings,
    evidenceGaps,
    stateMatrix,
    journeys,
  };
}
