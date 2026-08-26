import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The lane that fulfils a classified `customPresentation`.
 *
 * `planVisualRework` already refuses to let the Presentation Registry be a
 * ceiling: where a failing criterion needs something no registered presentation
 * renders, it classifies the requirement rather than answering "the closest
 * existing component". Until now nothing could then build one, so a direction
 * the registry could not serve was a recorded gap and a corpus risk.
 *
 * This is the smallest thing that closes it, and every constraint below is
 * doing work.
 *
 * **It is a stylesheet and nothing else.** A presentation that needed new
 * markup would need new bindings, and new bindings move the composition. Being
 * CSS-only is what makes "preserves PageSpec, SectionSpec and content
 * provenance" true by construction rather than by inspection, and it is why
 * ElementIdentity survives without a check — there is no markup to rewrite.
 *
 * **It is scoped to one section.** Every selector must be anchored to the
 * section's own id. A bespoke presentation that could restyle the rest of the
 * site is a second stylesheet, not a presentation.
 *
 * **It reads tokens, it does not invent values.** A literal colour would make
 * one file a second design authority, so colour literals are refused outright
 * and every custom property it reads must be one the project's compiled
 * DesignSystemSpec actually emits.
 *
 * **It is project-local, and stays there.** Promotion into the registry needs
 * repeated evidence across projects. A lane that promoted on first use would
 * turn one project's exception into every project's default, which is the
 * failure the registry exists to prevent.
 *
 * **The factory cannot pass its own.** A fulfilment starts, and can only start,
 * `awaiting-visual-review`. AGENTS.md rule 17 is not softened because the
 * artifact is small.
 */

export const BESPOKE_ROOT = 'src/presentation/bespoke';

/** What a fulfilment is allowed to own, and what it may never reach. */
const FORBIDDEN_PREFIXES = Object.freeze([
  'src/generated/',
  '.product/',
  '.app-builder/',
  'package.json',
  'docs/',
  'netlify.toml',
]);

// A colour written as a literal rather than read from a token. Refused because
// a bespoke presentation that picks its own colour is a second design
// authority living in one project's stylesheet.
const COLOUR_LITERAL = /(#[0-9a-f]{3,8}\b)|\b(rgba?|hsla?|lab|lch|oklab|oklch|color)\s*\(/i;
// `color-mix(in srgb, var(--color-page) 88%, transparent)` is how the shared
// presentation already blends, and it is not a literal — it names tokens. It is
// allowed only when every colour inside it is a token.
const COLOUR_MIX = /color-mix\s*\(/i;

/**
 * The template's own token defaults, in whichever shape the caller has.
 *
 * `templateTokenDefaults` returns an object of token to value, which is what
 * DesignLint reads; a caller that only knows the names has a Set. Normalising
 * here rather than making every caller convert is the difference between one
 * helper and a conversion each call site can get wrong.
 */
function defaultedTokens(defaults) {
  if (defaults instanceof Set) return defaults;
  if (defaults && typeof defaults === 'object') return new Set(Object.keys(defaults));
  return new Set();
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function declarations(css) {
  const out = [];
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, body: match[2] });
  }
  return out;
}

function blocks(css) {
  // Everything at the top level of an at-rule body plus the top level itself,
  // flattened, so a rule nested inside `@media` is still checked.
  return declarations(css);
}

/**
 * Every reason this declaration may not be written into a project.
 *
 * Returns problems rather than throwing on the first, because a person fixing
 * a bespoke presentation should see all of them at once.
 */
export function validateBespokePresentation(fulfilment, { compiledTokens = {}, templateTokenDefaults = new Set() } = {}) {
  const problems = [];
  const defaulted = defaultedTokens(templateTokenDefaults);
  const css = fulfilment?.css ?? '';
  const sectionId = fulfilment?.sectionId ?? '';

  if (fulfilment?.scope !== 'project-local') {
    problems.push({ rule: 'scope', detail: `A fulfilment may only claim project-local scope; this claims ${JSON.stringify(fulfilment?.scope)}. Promotion into the Presentation Registry needs repeated evidence across projects and is a separate decision.` });
  }
  if (fulfilment?.status && fulfilment.status !== 'awaiting-visual-review' && !fulfilment.review) {
    problems.push({ rule: 'self-approval', detail: `A fulfilment is ${fulfilment.status} with no recorded review. The factory wrote this presentation, so it may not pass it (AGENTS.md rule 17).` });
  }

  // Ownership. Every file is inside the bespoke root, and nothing reaches the
  // composition, the compiled design system or the project's manifest.
  for (const file of fulfilment?.changeSet?.files ?? []) {
    const normalised = file.replace(/\\/g, '/');
    if (path.isAbsolute(normalised) || normalised.split('/').includes('..')) {
      problems.push({ rule: 'change-set', detail: `${file} escapes the project directory.` });
      continue;
    }
    if (FORBIDDEN_PREFIXES.some((prefix) => normalised === prefix || normalised.startsWith(prefix))) {
      problems.push({ rule: 'change-set', detail: `${file} is outside what a bespoke presentation may own. It may not reach the composition, the compiled design system, the generated modules or the package manifest.` });
      continue;
    }
    if (!normalised.startsWith(`${BESPOKE_ROOT}/`)) {
      problems.push({ rule: 'change-set', detail: `${file} is not under ${BESPOKE_ROOT}/. A bespoke presentation owns its own directory and nothing else.` });
    }
  }

  // Scoping. Every selector is anchored to this section.
  const anchor = `[data-section-id="${sectionId}"]`;
  for (const { selector } of blocks(css)) {
    const targets = selector.split(',').map((entry) => entry.trim()).filter(Boolean);
    for (const target of targets) {
      if (!target.includes(anchor)) {
        problems.push({ rule: 'section-scope', detail: `Selector \`${target}\` is not anchored to ${anchor}. A bespoke presentation styles one section; anything wider is a second stylesheet.` });
      }
    }
  }

  // Values. Colours come from tokens, and every token exists.
  for (const { selector, body } of blocks(css)) {
    const withoutMix = body.replace(/color-mix\s*\(/gi, '(');
    const literal = withoutMix.match(COLOUR_LITERAL);
    if (literal && !COLOUR_MIX.test(body)) {
      problems.push({ rule: 'token-only', detail: `\`${selector}\` writes the colour ${literal[0]} directly. Colour comes from the compiled DesignSystemSpec; a presentation that picks its own is a second design authority.` });
    } else if (literal && COLOUR_MIX.test(body) && /#[0-9a-f]{3,8}\b/i.test(body)) {
      problems.push({ rule: 'token-only', detail: `\`${selector}\` mixes a literal colour into color-mix(). Every colour in the mix must be a token.` });
    }
  }
  const referenced = [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1]);
  for (const token of new Set(referenced)) {
    if (Object.hasOwn(compiledTokens, token) || defaulted.has(token)) continue;
    problems.push({ rule: 'unknown-token', detail: `${token} is not emitted by this project's compiled DesignSystemSpec and the template does not default it, so the declaration would resolve to nothing.` });
  }
  const declared = new Set(fulfilment?.tokensUsed ?? []);
  for (const token of new Set(referenced)) {
    if (!declared.has(token)) problems.push({ rule: 'undeclared-token', detail: `${token} is read by the stylesheet but not declared in tokensUsed. A dependency nothing records is a dependency nothing can check when the compiler stops emitting it.` });
  }

  // Responsive. It composes at a phone width rather than inheriting desktop.
  const hasMobileBlock = /@media[^{]*max-width\s*:\s*(\d+)px/i.test(css);
  if (!hasMobileBlock) {
    problems.push({ rule: 'responsive', detail: 'No mobile block. The classification requires a bespoke presentation to compose deliberately at a phone width rather than inherit the desktop arrangement narrowed.' });
  }
  if (fulfilment?.responsive && fulfilment.responsive.composesAtMobile !== true) {
    problems.push({ rule: 'responsive', detail: 'The fulfilment does not claim to compose at mobile, and the classification required it.' });
  }

  // Motion. Anything that moves has a reduced-motion answer.
  const movesAt = blocks(css).filter(({ body }) => /(^|;)\s*(transition|animation)\s*:/i.test(body));
  const reducedMotion = /@media[^{]*prefers-reduced-motion\s*:\s*reduce/i.test(css);
  if (movesAt.length && !reducedMotion) {
    problems.push({ rule: 'motion', detail: `${movesAt.length} rule(s) declare motion and nothing answers prefers-reduced-motion: reduce. A MotionContract honoured only where it was written is not honoured.` });
  }
  if (fulfilment?.motion?.declaresMotion && !fulfilment.motion.reducedMotionHonoured) {
    problems.push({ rule: 'motion', detail: 'The fulfilment declares motion and does not claim to honour reduced motion.' });
  }
  if (!movesAt.length && fulfilment?.motion?.declaresMotion) {
    problems.push({ rule: 'motion', detail: 'The fulfilment claims to declare motion and the stylesheet declares none.' });
  }

  return problems;
}

/**
 * Turn a classified requirement into a fulfilment record.
 *
 * The declaration itself is supplied — this lane does not write CSS, it bounds
 * and records it. That separation is deliberate: what makes a bespoke
 * presentation safe is the boundary, and a boundary that also authored the
 * thing it bounds would be marking its own work.
 */
export function fulfilBespokePresentation({ plan, projectId, css, tokensUsed = [], responsive, motion, createdAt, createdBy = 'art-direction', compiledTokens = {}, templateTokenDefaults = new Set() } = {}) {
  const classification = plan?.customPresentation;
  if (!classification) {
    throw new Error('A bespoke presentation fulfils a classified customPresentation requirement. This rework plan classified none, so there is nothing to fulfil — and building one anyway would be the registry-is-a-ceiling failure in reverse.');
  }
  if (classification.status && classification.status !== 'classified') {
    throw new Error(`The customPresentation on plan ${plan.planId} is already ${classification.status}.`);
  }
  if (!createdAt) throw new Error('A bespoke presentation records when it was created.');
  if (!css) throw new Error('A bespoke presentation is a declaration. An empty one fulfils nothing.');

  const fulfilment = {
    schemaVersion: 1,
    presentationId: `bespoke-${sha256({ planId: plan.planId, sectionId: classification.sectionId, css }).slice(0, 16)}`,
    projectId,
    setId: plan.setId ?? null,
    planId: plan.planId ?? null,
    sectionId: classification.sectionId,
    sectionType: classification.sectionType ?? null,
    scope: 'project-local',
    status: 'awaiting-visual-review',
    artDirectionNeed: classification.artDirectionNeed,
    registryInsufficientBecause: classification.registryInsufficientBecause,
    changeSet: { files: [`${BESPOKE_ROOT}/${classification.sectionId.replace(/[^a-z0-9-]/gi, '-')}.css`] },
    css,
    tokensUsed: [...new Set(tokensUsed)].sort(),
    responsive: responsive ?? { composesAtMobile: true, detail: classification.responsiveBehaviour },
    motion: motion ?? { declaresMotion: false, reducedMotionHonoured: true, detail: classification.motionBehaviour },
    designLint: null,
    renderedEvidenceId: null,
    review: null,
    frozenTruthHash: plan.frozenTruthHash,
    registryPromotion: {
      eligible: false,
      requires: 'Repeated evidence across unrelated projects that the same presentation was needed and passed review. One project needing something is not a component; it is one project needing something.',
    },
    createdAt,
    createdBy,
  };

  const problems = validateBespokePresentation(fulfilment, { compiledTokens, templateTokenDefaults });
  if (problems.length) {
    throw new Error(`This bespoke presentation cannot be written into the project:\n${problems.map((problem) => `- [${problem.rule}] ${problem.detail}`).join('\n')}`);
  }
  return fulfilment;
}

/**
 * Write it, inside its own ChangeSet and nowhere else.
 *
 * Re-validates rather than trusting the record it was handed. A fulfilment that
 * reached this function through some other path gets the same boundary.
 */
export function writeBespokePresentation(projectDir, fulfilment, { compiledTokens = {}, templateTokenDefaults = new Set() } = {}) {
  const problems = validateBespokePresentation(fulfilment, { compiledTokens, templateTokenDefaults });
  if (problems.length) throw new Error(`Refusing to write bespoke presentation ${fulfilment.presentationId}:\n${problems.map((problem) => `- [${problem.rule}] ${problem.detail}`).join('\n')}`);

  const root = path.resolve(projectDir);
  const written = [];
  for (const file of fulfilment.changeSet.files) {
    const target = path.resolve(root, file);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Bespoke presentation ${fulfilment.presentationId} tried to write outside the project: ${file}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, fulfilment.css.endsWith('\n') ? fulfilment.css : `${fulfilment.css}\n`);
    written.push(file);
  }
  return written;
}

/**
 * Record an independent verdict.
 *
 * The reviewer may not be the creator, and a pass needs the deterministic
 * checks to have actually run and come back clean. Both refusals are the same
 * rule 17 the candidate promotion path enforces; a smaller artifact does not
 * earn a smaller boundary.
 */
export function reviewBespokePresentation(fulfilment, { verdict, reviewedBy, reviewedAt, notes = null } = {}) {
  if (!['pass', 'rework', 'reject'].includes(verdict)) throw new Error(`Unknown bespoke presentation verdict: ${String(verdict)}.`);
  if (!reviewedBy) throw new Error('A bespoke presentation review records who issued it.');
  if (!reviewedAt) throw new Error('A bespoke presentation review records when it was issued.');
  if (reviewedBy === fulfilment.createdBy) {
    throw new Error(`${reviewedBy} created this presentation and may not review it. AGENTS.md rule 17 is not softened because the artifact is one stylesheet.`);
  }
  if (fulfilment.review) throw new Error(`Bespoke presentation ${fulfilment.presentationId} already has a verdict from ${fulfilment.review.reviewedBy}.`);

  if (verdict === 'pass') {
    const lint = fulfilment.designLint;
    if (!lint) throw new Error('A pass needs DesignLint to have run over the build this presentation is in. An unlinted pass is a judgement about something nobody measured.');
    if (lint.violation > 0) throw new Error(`DesignLint reports ${lint.violation} violation(s). A deterministic violation is not something a visual verdict can overrule.`);
    if (!fulfilment.renderedEvidenceId) throw new Error('A pass needs rendered evidence. A verdict on a presentation nobody photographed is a verdict on a description of it.');
  }

  return {
    ...fulfilment,
    status: verdict === 'pass' ? 'accepted' : verdict === 'reject' ? 'rejected' : 'awaiting-visual-review',
    review: { verdict, reviewedBy, reviewedAt, notes },
  };
}
