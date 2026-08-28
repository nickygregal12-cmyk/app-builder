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
 * The scrolling navigation row.
 *
 * The review found it "visibly clipped". The cause was two omissions rather
 * than a width: a flex item will not shrink below its longest word unless it
 * is told it may, so the brand set the width of the bar; and the scrollbar was
 * removed with nothing put in its place, so a row that continued looked like a
 * row that had ended.
 */
test('a scrolling navigation row gets its own width instead of competing with the brand', () => {
  // Measured, not assumed: sharing the row left three of five destinations
  // hidden at 375px even after the brand was allowed to shrink, because a flex
  // item stops at its longest word. Giving each its own row left one.
  const header = STYLES_CSS.split('\n').filter((line) => line.includes('.site-header.nav-inline-scroll')).join('\n');
  assert.match(header, /flex-wrap:\s*wrap/, 'the header must be allowed to put the row on its own line');
  const brand = STYLES_CSS.split('\n').find((line) => line.includes('.site-header.nav-inline-scroll .site-brand'));
  const nav = STYLES_CSS.split('\n').find((line) => line.includes('.site-header.nav-inline-scroll nav {'));
  assert.match(brand, /flex:\s*1 1 100%/, 'the brand takes its own row');
  assert.match(nav, /flex:\s*1 1 100%/, 'the destinations take the full measure rather than what is left of it');
});

test('a scrolling navigation row shows that it continues', () => {
  const nav = STYLES_CSS.split('\n').filter((line) => line.includes('.site-header.nav-inline-scroll nav')).join('\n');
  assert.match(nav, /overflow-x:\s*auto/);
  assert.match(nav, /scrollbar-width:\s*none/);
  // Hiding the scrollbar is only legitimate if something replaces it.
  assert.match(nav, /mask-image/, 'a row that hides its scrollbar must give the reader another cue that it scrolls');
  assert.match(nav, /min-width:\s*0/, 'the row itself must be allowed to shrink so it can scroll rather than push');
});

test('every destination stays in the document, so the row is scrolled rather than truncated', () => {
  // The failure mode this forbids is "fix the clipping by rendering fewer
  // links", which would look correct in a screenshot and lose the pages.
  // The scrollbar itself is allowed to be hidden — the mask replaces it. What
  // must never be hidden is a destination.
  const nav = STYLES_CSS.split('\n')
    .filter((line) => line.includes('nav-inline-scroll') && !line.includes('::-webkit-scrollbar'))
    .join('\n');
  assert.doesNotMatch(nav, /display:\s*none/, 'destinations must not be hidden to make the row fit');
});
