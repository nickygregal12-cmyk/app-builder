/**
 * A demonstration, not a fix.
 *
 * `selectReference` in tooling/lib/visual-benchmarks.mjs scores each benchmark reference as
 *
 *     anchorHits * 2 + kindHit * 3
 *
 * where `kindHit` is
 *
 *     reference.appropriateFor.some((entry) => entry.toLowerCase().includes(kind))
 *
 * — the *reference's* short category phrase must contain the *candidate's* business-kind string.
 * That is the wrong way round. A candidate describes itself specifically ("hospitality lettings
 * and places to stay") and a reference describes a category broadly ("hospitality and destination
 * businesses"), so the longer, more specific string is being looked for inside the shorter, more
 * general one. It can only fire when the candidate's declared kind happens to be a literal
 * substring of the reference's phrase.
 *
 * The consequence is not cosmetic. kindHit is weighted 3 and an anchor hit 2, so the term that
 * is meant to dominate the match is the term that almost never fires, and selection falls back
 * entirely to anchor keywords.
 *
 * On this prototype that sent a one-property tidal-island letting to be compared against Aesop
 * rather than Aman — the hospitality reference, which exists in the corpus and is explicitly
 * `appropriateFor: "hospitality and destination businesses"`. Three of the six dimensions Aesop
 * won were then decided on catalogue size: "a much larger and more varied commercial estate",
 * "a much larger catalogue, editorial library and store network", "a broader set of mature
 * commerce behaviours". Those are true statements about Aesop and they are not judgements about
 * this website's quality.
 *
 * THE EVALUATOR IS NOT CHANGED BY THIS PROTOTYPE. The programme instruction is that it stays
 * frozen unless a defect is demonstrated, and that it must not be altered because a prototype
 * scored lower than hoped. Both apply here at once, and the second is the reason this is a probe
 * that prints evidence rather than a patch: a fix authored by the site being measured, which
 * would move that site's own benchmark comparison, is exactly the change an owner should get to
 * refuse. The finding is recorded; the decision is not mine.
 *
 *   node benchmark-selection-probe.mjs
 */
import { loadBenchmarkReferences, selectReference } from '../../../tooling/lib/visual-benchmarks.mjs';

const corpus = loadBenchmarkReferences();
const line = (label, value) => console.log(`${String(label).padEnd(46)} ${value}`);

console.log('=== 1. What this prototype declares, and what it gets ===\n');
const declared = {
  businessKind: 'hospitality lettings and places to stay',
  anchors: ['place-and-atmosphere', 'restraint', 'editorial-rhythm'],
};
const got = selectReference({ ...declared, corpus });
line('declared businessKind', `"${declared.businessKind}"`);
line('selected reference', `${got.reference.id} (${got.reference.name})`);
for (const entry of got.ordered) line(`  ${entry.id}`, `score ${entry.score}`);

console.log('\n=== 2. The kind term, in isolation ===\n');
const kinds = [
  'hospitality lettings and places to stay',
  'hospitality and destination businesses',
  'hospitality',
  'commerce',
  'research, reports and data-led publications',
  'electrical infrastructure',
  'paint and pigment manufacture',
];
for (const kind of kinds) {
  const hits = corpus.references.filter((reference) =>
    (reference.appropriateFor ?? []).some((entry) => String(entry).toLowerCase().includes(kind.toLowerCase())));
  line(`"${kind}"`, hits.length ? `matches ${hits.map((r) => r.id).join(', ')}` : 'MATCHES NOTHING');
}

console.log('\nThe only strings that earn the three-point term are short category words that happen');
console.log('to appear verbatim inside a reference phrase. Every business description written the');
console.log('way a brief describes a business scores zero on it.\n');

console.log('=== 3. What the same site gets if the containment is tested the other way ===\n');
const contains = (a, b) => {
  const A = String(a).toLowerCase();
  const B = String(b).toLowerCase();
  return A.includes(B) || B.includes(A);
};
const alternative = corpus.references
  .map((reference) => {
    const anchorHits = (reference.anchorsFor ?? [])
      .filter((anchor) => declared.anchors.map((a) => a.toLowerCase()).includes(String(anchor).toLowerCase())).length;
    // Same weights, same shape. Only the direction of the substring test changes, and only for
    // the leading noun of the declared kind — "hospitality" against "hospitality and destination
    // businesses". This is illustrative arithmetic, not a proposed implementation.
    const head = declared.businessKind.split(/[ ,]/)[0];
    const kindHit = (reference.appropriateFor ?? []).some((entry) => contains(entry, head)) ? 1 : 0;
    return { id: reference.id, score: anchorHits * 2 + kindHit * 3, anchorHits, kindHit };
  })
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
for (const entry of alternative) line(`  ${entry.id}`, `score ${entry.score}  (anchors ${entry.anchorHits}, kind ${entry.kindHit})`);

console.log('');
line('selected as shipped', got.reference.id);
line('selected if the test ran both ways', alternative[0].id);
console.log('\nBoth are benchmark-class. The question is not which is better but which poses this');
console.log('site the right question, and "can you carry a global catalogue" is not it.\n');
