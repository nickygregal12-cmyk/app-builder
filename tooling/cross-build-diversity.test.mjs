import assert from 'node:assert/strict';
import test from 'node:test';

import { assessCrossBuildDiversity, crossBuildSignature, describeCrossBuildDiversity, SIGNALS } from './lib/cross-build-diversity.mjs';

function composition(pages) {
  const sections = [];
  const composed = pages.map((page, index) => {
    const sectionIds = page.sections.map((section, position) => {
      const id = `p${index}-s${position}`;
      sections.push({ id, type: section.type, variant: section.variant });
      return id;
    });
    return { id: `page-${index}`, path: page.path, sectionIds };
  });
  return { pages: composed, sections };
}

function build(name, { pages, density = 'comfortable', patternId = 'public-marketing', voice = 'humanist-sans', direction = null }) {
  return crossBuildSignature({
    build: name,
    composition: composition(pages),
    design: { density, patternId, brand: { typography: { voice } } },
    direction,
  });
}

const HOME = [{ path: '/', sections: [{ type: 'hero', variant: 'primary' }, { type: 'entity-list', variant: 'list' }] }];
const OTHER = [{ path: '/', sections: [{ type: 'hero', variant: 'immersive' }, { type: 'gallery', variant: 'grid' }, { type: 'proof', variant: 'quote' }] }];

test('the diagnostic covers every signal docs/VISUAL_EXCELLENCE.md §8 names', () => {
  const covered = new Set(SIGNALS.map((signal) => signal.id));
  for (const required of ['sequence', 'heroStrategy', 'gridFamily', 'informationDensity', 'headingTreatment', 'typographicVoice', 'ctaPlacement', 'distinctiveMoment', 'responsiveStrategy', 'motionIntensity']) {
    assert.ok(covered.has(required), `the diagnostic no longer reads the ${required} signal`);
  }
});

test('it reuses the candidate-set signature rather than deriving a second idea of structural difference', async () => {
  const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('./lib/cross-build-diversity.mjs', import.meta.url), 'utf8'));
  assert.match(source, /import \{ structuralSignature \} from '\.\/visual-direction\.mjs'/, 'a second structural-signature implementation would let "structurally different" mean one thing inside a candidate set and another across the corpus');
});

test('two unrelated businesses with the same everything are named as identical', () => {
  const report = assessCrossBuildDiversity([
    build('joiners', { pages: HOME }),
    build('accountants', { pages: HOME }),
    build('florists', { pages: HOME }),
  ]);
  assert.equal(report.identical.length, 3, 'every pair of three identical builds is a finding');
  assert.match(report.identical[0].detail, /two unrelated businesses with the same structure/);
});

test('a different section sequence is enough to stop a pair being identical, and the shared signals are still listed', () => {
  const report = assessCrossBuildDiversity([
    build('joiners', { pages: HOME }),
    build('gallery', { pages: OTHER }),
  ]);
  assert.equal(report.identical.length, 0);
  assert.equal(report.leastDifferent.length, 1);
  assert.deepEqual(report.leastDifferent[0].differing, ['sequence']);
  assert.ok(report.leastDifferent[0].shared.length > 5, 'the signals two builds share are the finding, not a footnote');
});

test('a signal with one value across the set is uniform; a signal that varies is not', () => {
  const report = assessCrossBuildDiversity([
    build('a', { pages: HOME, density: 'comfortable', voice: 'humanist-sans' }),
    build('b', { pages: OTHER, density: 'compact', voice: 'humanist-sans' }),
  ]);
  assert.equal(report.signals.typographicVoice.uniform, true);
  assert.equal(report.signals.informationDensity.uniform, false);
  assert.ok(report.uniform.includes('typographicVoice'));
  assert.ok(!report.uniform.includes('informationDensity'));
});

test('a single build is never uniform, because one build cannot repeat itself', () => {
  const report = assessCrossBuildDiversity([build('only', { pages: HOME })]);
  assert.deepEqual(report.uniform, []);
  assert.equal(report.meaningful, false, 'a corpus of one cannot show whether unrelated businesses look alike');
});

test('the diagnostic is advisory and says so on the record, not only in a comment', () => {
  const report = assessCrossBuildDiversity([build('a', { pages: HOME }), build('b', { pages: OTHER })]);
  assert.equal(report.advisory, true);
  assert.equal(report.blocking, false);
  assert.ok(describeCrossBuildDiversity(report).some((line) => /Nothing here blocks a build/.test(line)));
});

test('a set where no direction was promoted says why its signals are uniform', () => {
  const report = assessCrossBuildDiversity([build('a', { pages: HOME }), build('b', { pages: HOME })]);
  assert.equal(report.buildsWithPromotedDirection, 0);
  const lines = describeCrossBuildDiversity(report);
  assert.ok(
    lines.some((line) => /No build in this set carries a promoted visual direction/.test(line)),
    'without this the first reading of a uniform signal is "the factory makes every business the same", which is a different and unproven claim',
  );
});

test('a set that did promote directions drops the caveat, because then the uniformity would be the factory\'s answer', () => {
  const direction = {
    id: 'structured-practice',
    artDirection: {
      dimensions: { heroStrategy: 'editorial', gridFamily: 'asymmetric', headingTreatment: 'display', ctaPlacement: 'inline', distinctiveMoment: 'lead-statement', layoutVariance: 'high', visualDistinctiveness: 'high', motionIntensity: 'restrained', informationDensity: 'comfortable' },
      responsive: { mobileHero: 'copy-first', navigation: 'disclosure', mobileSectionOrder: 'as-desktop', mobileDensity: 'compact', mobileMotion: 'none' },
    },
  };
  const report = assessCrossBuildDiversity([
    build('a', { pages: HOME, direction }),
    build('b', { pages: OTHER, direction }),
  ]);
  assert.equal(report.buildsWithPromotedDirection, 2);
  assert.ok(!describeCrossBuildDiversity(report).some((line) => /No build in this set carries a promoted visual direction/.test(line)));
  assert.equal(report.signals.heroStrategy.commonest, 'editorial', 'a promoted direction is what the signature reads once one exists');
});
