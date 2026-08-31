/**
 * Choosing a direction to work with, without claiming somebody accepted it.
 *
 * Generating candidates, comparing them and then adopting one is the point of
 * the compare view, and the last step had no door. Promotion is a reviewed
 * decision — a named person, a rationale, a score against every criterion — and
 * it records that somebody judged the design. An owner building their own site
 * is not conducting an acceptance review, so the only route to seeing a chosen
 * direction in their own preview was to file a verdict they had not made.
 *
 * The factory already had the honest mechanism: `visualDirection` is an ordinary
 * design choice, the same kind the density and radius controls write, recorded
 * as `chosenBy: console` with no reviewer attached. Nothing in the Console
 * reached it. These guard the two halves of that: the door exists, and it did
 * not become a second way to promote.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const WORKSPACE = 'apps/console/src/workspace/BuilderWorkspace.tsx';
const source = fs.readFileSync(WORKSPACE, 'utf8');

test('a compared candidate can be adopted as a working design choice', () => {
  assert.match(source, /candidate-adopt/, 'the compare view has no way to carry on with a candidate');
  assert.match(source, /onAdopt/, 'adopting must be handed in, not reimplemented inside the panel');
  // The ordinary design-choice writer, not a promotion call in disguise.
  assert.match(source, /onAdopt=\{\(directionId\) => chooseDesign\(\{ visualDirection: directionId \}\)\}/,
    'adopting must write an ordinary design choice, the same path density and radius use');
});

test('adopting is not promoting, and does not borrow promotion\'s language', () => {
  const start = source.indexOf('className="candidate-adopt"');
  assert.ok(start > 0, 'the adopt block should sit inside the candidate card');
  const panel = source.slice(start, source.indexOf('</article>;', start));
  assert.doesNotMatch(panel, /promoteVisualCandidate|recordVisualReview/,
    'the working-choice path must never reach the review or promotion endpoints');
  assert.doesNotMatch(panel, /reviewer/,
    'a working choice has no reviewer, and asking for one would make it a verdict');
  // Said in words, because the distinction is the whole reason this exists.
  assert.match(panel, /not an acceptance/i, 'the control must say that choosing is not accepting');
});

test('promotion keeps every guard it had', () => {
  // The reviewed path is untouched: a named reviewer, a rationale and a full
  // score are still required before anything may be passed or promoted.
  const promote = source.slice(source.indexOf('promote-${candidate.candidateId}') - 400, source.indexOf('Promote this one'));
  assert.match(promote, /!reviewer\.trim\(\)/, 'promotion must still require a named reviewer');
  assert.match(source, /verdict === 'pass' &&/, 'promotion must still follow a recorded pass');
});
