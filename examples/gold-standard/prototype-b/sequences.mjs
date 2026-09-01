/**
 * The B0 calibration capture: three frames of one interaction, deterministically.
 *
 * This prototype already ships a mid-flight frame. It was taken by sleeping 90ms into a 220ms
 * transition and photographing whatever had happened by then, which produced a usable picture and
 * is not a method — the same script on a slower host photographs a settled page and labels it
 * mid-flight.
 *
 * This uses the technique the production harness now uses instead, so the experiment tests the
 * real thing rather than an approximation of it:
 *
 *   1. stretch every transition on the page, BEFORE anything triggers one, so there is no race to
 *      lose;
 *   2. trigger;
 *   3. pause every running animation and seek it to a stated fraction of its own duration;
 *   4. photograph.
 *
 * A CSS transition interpolates on normalised progress, so half of a stretched transition is the
 * same frame as half of the real one — the easing curve is a function of the fraction, not of the
 * clock. What is lost is any ability to read the real duration off the capture, so the manifest
 * does not claim one.
 *
 * The interaction is chosen, not swept. Selecting step 07 closes an earth onto a conductor that
 * stays energised, and the movement between the two states is the product's entire argument. Every
 * other transition on this site is a hover underline.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4333';
const OUT = process.argv[2] ?? 'evidence/sequences';
const AT_PROGRESS = 0.5;
const STRETCH_MS = 4000;

fs.mkdirSync(OUT, { recursive: true });

/** Hold every running animation at a fraction of its own duration. Returns how many it caught. */
const seek = (page, fraction) => page.evaluate((progress) => {
  const running = document.getAnimations().filter((animation) => {
    const duration = animation.effect?.getTiming?.()?.duration;
    return typeof duration === 'number' && duration > 0;
  });
  for (const animation of running) {
    animation.pause();
    animation.currentTime = animation.effect.getTiming().duration * progress;
  }
  return running.length;
}, fraction);

const stretch = (page) => page.addStyleTag({
  content: `*, *::before, *::after {
    transition-duration: ${STRETCH_MS}ms !important;
    animation-duration: ${STRETCH_MS}ms !important;
    transition-delay: 0ms !important;
    animation-delay: 0ms !important;
  }`,
});

const SEQUENCES = [
  {
    id: 'schedule-step-refused',
    route: '/',
    width: 1440,
    height: 900,
    purpose:
      'Whether the refusal arrives or is simply true. Selecting step 07 closes an earth onto a conductor that stays energised, and the conductors travelling from dead grey to live red is how the site argues that the model — not the page — found it. Two stills of the same diagram before and after are identical whether the change is animated or instant.',
    settle: async (page) => {
      // Scoped to the step list. `[data-step]` also matches the bars in the exposure
      // profile, and clicking one of those is a different interaction.
      await page.locator('ol.steps[data-steps]').waitFor({ state: 'visible', timeout: 10_000 });
      await page.locator('ol.steps [data-step="4"]').first().click();
      await page.waitForTimeout(600);
    },
    trigger: async (page) => {
      await page.locator('ol.steps [data-step="7"]').first().click();
    },
    reached: async (page) => {
      await page.locator('.refusal').waitFor({ state: 'visible', timeout: 10_000 });
    },
  },
];

const browser = await chromium.launch();
const manifest = [];
const problems = [];

for (const sequence of SEQUENCES) {
  const context = await browser.newContext({
    viewport: { width: sequence.width, height: sequence.height },
    deviceScaleFactor: 1,
    // Motion allowed, which is the whole point. The reduced-motion counterpart is the still this
    // prototype already captures under `reduce`.
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const shot = async (frame) => {
    const file = `${sequence.id}--${frame}.png`;
    await page.screenshot({ path: `${OUT}/${file}`, animations: 'allow', type: 'png' });
    manifest.push({
      file,
      route: sequence.route,
      viewport: `${sequence.width}x${sequence.height}`,
      sequenceId: sequence.id,
      frame,
      atProgress: frame === 'during' ? AT_PROGRESS : null,
      purpose: sequence.purpose,
    });
  };

  try {
    await page.goto(BASE + sequence.route, { waitUntil: 'networkidle' });
    await sequence.settle(page);
    await shot('before');

    await stretch(page);
    await sequence.trigger(page);
    const held = await seek(page, AT_PROGRESS);
    if (!held) {
      throw new Error('the trigger animated nothing, so a during-frame would be the after-frame with a different label');
    }
    await shot('during');

    // Let it finish. The stretch is still in place, so this waits on the real end state rather
    // than on a duration.
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.play();
        animation.finish();
      }
    });
    await sequence.reached(page);
    await shot('after');
    console.log(`ok ${sequence.id} — held ${held} animation(s) at ${AT_PROGRESS}`);
  } catch (error) {
    problems.push(`${sequence.id}: ${error.message}`);
    console.error(`FAILED ${sequence.id}: ${error.message}`);
  } finally {
    await context.close();
  }
}

await browser.close();

/*
 * A sequence is evidence as a sequence. A during-frame without its endpoints is a still that reads
 * as a transition, so a partial run fails rather than publishing one.
 */
for (const sequence of SEQUENCES) {
  const frames = manifest.filter((entry) => entry.sequenceId === sequence.id).map((entry) => entry.frame);
  for (const frame of ['before', 'during', 'after']) {
    if (!frames.includes(frame)) problems.push(`${sequence.id} is missing its ${frame} frame`);
  }
}

fs.writeFileSync(`${OUT}/index.json`, `${JSON.stringify(manifest, null, 1)}\n`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`\n${manifest.length} frames -> ${OUT}`);
}
