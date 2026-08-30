import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { visualDirectionClasses } from './lib/visual-direction.mjs';

const STYLES_CSS = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');

/**
 * What a phone actually gets, as rules rather than as taste.
 *
 * Both defects here were named by an independent visual review of the nbm
 * candidate set and are the reason `responsive-quality` failed its floor in
 * both candidates. Neither is subjective: one puts a generic panel above the
 * content a visitor came for, and the other hides three of five destinations.
 */

/** The declarations a direction hands the stylesheet. */
function classesFor({ ctaPlacement = 'closing', mobileSectionOrder = 'conversion-first', navigation = 'disclosure' } = {}) {
  return visualDirectionClasses({
    id: 'fixture',
    shellClass: 'layout-public',
    artDirection: {
      dimensions: { heroStrategy: 'split', gridFamily: 'symmetric', headingTreatment: 'plain', ctaPlacement, distinctiveMoment: 'lead-statement' },
      responsive: { mobileHero: 'copy-first', navigation, mobileSectionOrder, mobileDensity: 'as-desktop', mobileMotion: 'as-desktop' },
    },
  });
}

/**
 * The mobile order block, as the browser would resolve it for one shell.
 *
 * Deliberately textual rather than a headless browser: the question is which
 * selectors the compiled classes match, and a string answers that without a
 * 150MB dependency. The rendered behaviour is proved separately by the
 * candidate capture run.
 */
function hoistsCtaSection(classes) {
  const shell = new Set(classes.split(/\s+/).filter(Boolean));
  // Every `order: 1` rule that mentions .cta-section, and whether this shell
  // satisfies the classes that rule requires of the shell element.
  return STYLES_CSS
    .split('\n')
    .filter((line) => line.includes('.cta-section') && line.includes('order: 1'))
    .some((line) => {
      // The shell classes the rule demands, which is everything it names
      // except the section it is targeting.
      const required = [...line.matchAll(/\.(mobile-order-[a-z-]+|cta-[a-z-]+)/g)]
        .map((match) => match[1])
        .filter((name) => name !== 'cta-section');
      return required.every((name) => shell.has(name));
    });
}

test('a closing call to action is not hoisted above the page on a phone', () => {
  // The rejected build: conversion-first plus a closing ask produced /services
  // opening with "Get in touch" above the services themselves.
  assert.equal(hoistsCtaSection(classesFor({ ctaPlacement: 'closing' })), false,
    'a direction that declares the ask closes the page must not have it pulled to the top on mobile');
});

test('a mid-page call to action still moves, because that is a different declaration', () => {
  assert.equal(hoistsCtaSection(classesFor({ ctaPlacement: 'mid-page' })), true,
    'conversion-first must still express a direction that declared a mid-page ask');
});

test('conversion-first still pulls a real way of making contact forward', () => {
  // The behaviour worth keeping: contact detail and the enquiry form are how
  // someone on a phone actually converts, and they stay hoisted.
  const rule = STYLES_CSS.split('\n').find((line) => line.includes('.mobile-order-conversion-first .contact-section'));
  assert.ok(rule, 'conversion-first must still hoist contact detail');
  assert.match(rule + STYLES_CSS, /section-enquiry-form/);
});

test('the ask placement reaches the shell so the stylesheet can tell the two apart', () => {
  assert.match(classesFor({ ctaPlacement: 'closing' }), /\bcta-closing\b/);
  assert.match(classesFor({ ctaPlacement: 'mid-page' }), /\bcta-mid-page\b/);
});

/**
 * The two defects the header has already shipped, now guarded for every family.
 *
 * The mobile row was a horizontal scroller twice and an independent reviewer
 * called it clipped both times — the second time as navigation "visibly clipped
 * at mobile width across pages, including a partially obscured Locations item".
 * It was then a wrapping two-row bar, which the fourth review called loose, and
 * `docs/PHASE_4D_VISUAL_DEBT.md` §7 left the choice between making that
 * deliberate and retiring it in favour of disclosure.
 *
 * It is retired: every navigation family now discloses behind a control, in its
 * own character. The rules those two defects earned do not lapse with the
 * treatment that caused them, so they are asserted over the whole header block
 * rather than over one class.
 */
const HEADER_RULES = STYLES_CSS.split('\n').filter((line) => line.includes('.site-header') || line.includes('.nav-'));

test('no navigation family scrolls a destination out of view', () => {
  const header = HEADER_RULES.join('\n');
  assert.doesNotMatch(header, /overflow-x:\s*auto|overflow-x:\s*scroll/, 'a header scroller reads as a truncated row, however it is faded');
  assert.doesNotMatch(header, /mask-image/, 'a fade is an apology for clipping, not a navigation pattern');
});

test('every destination stays in the document and stays visible', () => {
  // The failure mode this forbids is "fix the fit by rendering fewer links",
  // which would look correct in a screenshot and lose the pages. `nav[data-open]`
  // is the disclosure itself and is excluded: a panel that is closed is closed,
  // and every destination inside it is one control away.
  const links = HEADER_RULES.filter((line) => line.includes('nav a') && !line.includes('data-open'));
  const text = links.join('\n');
  assert.doesNotMatch(text, /display:\s*none/, 'destinations must not be hidden to make the row fit');
  assert.doesNotMatch(text, /visibility:\s*hidden/, 'destinations must not be made invisible to make the row fit');
});

test('the retired two-row bar does not come back', () => {
  assert.doesNotMatch(STYLES_CSS, /nav-inline-wrap|nav-inline-scroll/, 'the loose wrapping row and the scroller are both retired');
});
