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
 * The wrapping navigation row.
 *
 * This was a scrolling row twice and an independent reviewer called it clipped
 * both times — the second time as navigation "visibly clipped at mobile width
 * across pages, including a partially obscured Locations item". A header
 * scroller asks the reader to drag a row that looks like it has already ended,
 * and no fade fixes a half-cut word. So the row wraps: every destination is
 * laid out, and none is off-screen to be discovered.
 */
test('the visible navigation treatment gets its own width instead of competing with the brand', () => {
  // A flex item will not shrink below its longest word, so sharing the row let
  // "Consultants" set the width of the bar.
  const header = STYLES_CSS.split('\n').filter((line) => line.includes('.site-header.nav-inline-wrap')).join('\n');
  assert.match(header, /flex-wrap:\s*wrap/, 'the header must be allowed to put the row on its own line');
  const brand = STYLES_CSS.split('\n').find((line) => line.includes('.site-header.nav-inline-wrap .site-brand'));
  const nav = STYLES_CSS.split('\n').find((line) => line.includes('.site-header.nav-inline-wrap nav {'));
  assert.match(brand, /flex:\s*1 1 100%/, 'the brand takes its own row');
  assert.match(nav, /flex:\s*1 1 100%/, 'the destinations take the full measure rather than what is left of it');
});

test('the visible navigation treatment wraps rather than scrolling out of view', () => {
  const nav = STYLES_CSS.split('\n').filter((line) => line.includes('.site-header.nav-inline-wrap nav')).join('\n');
  assert.match(nav, /flex-wrap:\s*wrap/, 'destinations wrap onto as many lines as they need');
  // The whole defect was a destination the reader could not see. Anything that
  // moves part of the row off-screen brings it straight back.
  assert.doesNotMatch(nav, /overflow-x:\s*auto|overflow-x:\s*scroll/, 'a header scroller reads as a truncated row, however it is faded');
  assert.doesNotMatch(nav, /mask-image/, 'a fade is an apology for clipping, not a navigation pattern');
  assert.doesNotMatch(nav, /flex-wrap:\s*nowrap/, 'nowrap is what forced the row to overflow');
});

test('every destination stays in the document and stays visible', () => {
  // The failure mode this forbids is "fix the clipping by rendering fewer
  // links", which would look correct in a screenshot and lose the pages.
  const nav = STYLES_CSS.split('\n')
    .filter((line) => line.includes('nav-inline-wrap'))
    .join('\n');
  assert.doesNotMatch(nav, /display:\s*none/, 'destinations must not be hidden to make the row fit');
  assert.doesNotMatch(nav, /visibility:\s*hidden/, 'destinations must not be made invisible to make the row fit');
});
