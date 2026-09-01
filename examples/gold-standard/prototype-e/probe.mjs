/**
 * Look at the model before building anything on it.
 *
 * Prototype D shipped a first draft whose generator had the finding written into its inputs, and
 * a probe like this one caught it. Prototype E's first draft of tide.ts had the causeway open
 * *longer* at springs — the physics inverted — and this caught that too.
 *
 * The rules being checked here are the ones the website makes claims about. If a claim on a page
 * is not checked below, either the check is missing or the claim is decoration.
 */
import { SEASON, SEASON_FACTS, hoursLabel, span, toneName, money } from './src/lib/season.ts';
import { CAUSEWAY_LIMIT, height, springNeap } from './src/lib/tide.ts';

const fail = [];
const check = (name, ok, detail) => {
  if (!ok) fail.push(`${name} — ${detail}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

console.log('--- a fortnight of days ---');
for (const day of SEASON.slice(0, 2).flatMap((w) => w.days)) {
  console.log(
    day.label.padEnd(11),
    `sn=${day.springNeap.toFixed(2)}`,
    `shut=${hoursLabel(day.shutHours)}`.padEnd(12),
    day.bars.map((c) => `${span(c)} (${hoursLabel(c.length)})`).join('  '),
  );
}

console.log('\n--- the season ---');
for (const week of SEASON.filter((_, i) => i % 5 === 0)) {
  console.log(
    week.label.padEnd(16),
    week.band.padEnd(9),
    `tone=${week.tone.toFixed(2)} ${toneName(week.tone).padEnd(7)}`,
    `shut=${hoursLabel(week.shutHours).padEnd(9)}`,
    `longest=${hoursLabel(week.longestShut).padEnd(8)}`,
    `arr=${week.arrival ? span(week.arrival) : 'NONE'}`.padEnd(16),
    `dep=${week.departure ? span(week.departure) : 'NONE'}`.padEnd(16),
    money(week.price),
  );
}

console.log('\n--- checks ---');

// The physics. A bigger range must shut the road for longer, or the model is not a causeway.
const byTone = [...SEASON].sort((a, b) => a.tone - b.tone);
const lowTone = byTone.slice(0, 8).reduce((t, w) => t + w.shutHours, 0) / 8;
const highTone = byTone.slice(-8).reduce((t, w) => t + w.shutHours, 0) / 8;
check(
  'springs shut the road for longer than neaps',
  highTone > lowTone + 1.5,
  `neapiest 8 weeks ${hoursLabel(lowTone / 7)}/day, springiest 8 ${hoursLabel(highTone / 7)}/day; ${hoursLabel(highTone - lowTone)} across a week`,
);

// The number the site actually leads with, and the reason it leads with it: the swing in
// crossing *length* is an hour, where the swing in shut-hours is twenty-odd minutes a day.
const lowCross = byTone.slice(0, 8).reduce((t, w) => t + w.meanCrossing, 0) / 8;
const highCross = byTone.slice(-8).reduce((t, w) => t + w.meanCrossing, 0) / 8;
check(
  'crossings are meaningfully longer at neaps than at springs',
  lowCross - highCross > 0.4,
  `neaps ${hoursLabel(lowCross)} per crossing, springs ${hoursLabel(highCross)} — ${Math.round((lowCross - highCross) * 60)} min`,
);

// The extremes of the cycle, which are wider than the week means and are what the crossing page
// quotes. Taken from whole crossings — the day bars gave 4h55 against 6h57, backwards, because
// two of every three neap bars are a midnight fragment.
const { atNeaps, atSprings } = SEASON_FACTS;
check(
  'at the extremes of the cycle the difference is closer to an hour',
  atNeaps.mean - atSprings.mean > 0.75,
  `${hoursLabel(atNeaps.mean)} across ${atNeaps.count} crossings at neaps, ${hoursLabel(atSprings.mean)} across ${atSprings.count} at springs`,
);

// The artefact that inverted the line above, kept as a check so it cannot come back: a week's
// crossings are whole, and there are about fourteen of them, not the twenty the clipped daily
// lists produce.
const clippedCount = SEASON[0].days.flatMap((d) => d.bars).length;
check(
  "a week's crossings are counted whole, not cut by midnight",
  SEASON[0].crossings.length < clippedCount,
  `${SEASON[0].crossings.length} whole crossings vs ${clippedCount} day-clipped fragments`,
);

// The threshold is above mean level, which is the reason the above is true.
check('causeway limit sits above mean level', CAUSEWAY_LIMIT > 2.9, `${CAUSEWAY_LIMIT}m vs 2.9m`);

// Two crossings on nearly every day, which is what the site says.
const days = SEASON.flatMap((w) => w.days);
const twoPlus = days.filter((d) => d.bars.length >= 2).length;
check('two or more crossings on almost every day', twoPlus / days.length > 0.95, `${twoPlus}/${days.length}`);

// The daily drift, measured from the high waters themselves rather than from the first crossing
// of each calendar day — that one is clipped by midnight and reported 35 min/day, which is an
// artefact of the day boundary and not the tide.
const highs = [];
for (let t = 1; t < 24 * 30; t += 1 / 60) {
  if (height(t) > height(t - 1 / 60) && height(t) >= height(t + 1 / 60)) highs.push(t);
}
const intervals = highs.slice(1).map((v, i) => v - highs[i]);
const meanInterval = intervals.reduce((t, v) => t + v, 0) / intervals.length;
const meanDrift = 2 * meanInterval - 24;
check('high water drifts ~50 min later each day', meanDrift > 0.7 && meanDrift < 1.0,
  `mean interval ${(meanInterval * 60).toFixed(1)} min, drift ${Math.round(meanDrift * 60)} min/day over ${highs.length} high waters`);

// The commercial claim: spring weeks cost less than neap weeks in the same season band.
const shoulder = SEASON.filter((w) => w.band === 'shoulder');
const springPrices = shoulder.filter((w) => w.tone > 0.66).map((w) => w.price);
const neapPrices = shoulder.filter((w) => w.tone < 0.34).map((w) => w.price);
check(
  'spring weeks are cheaper than neap weeks in the same band',
  springPrices.length > 0 && neapPrices.length > 0 && Math.max(...springPrices) < Math.min(...neapPrices),
  `shoulder springs ${springPrices.map(money).join(',')} vs neaps ${neapPrices.map(money).join(',')}`,
);

// Both kinds of week must actually occur, or the site is describing a range it does not sell.
check('the season contains both spring and neap weeks', springPrices.length >= 2 && neapPrices.length >= 2,
  `${SEASON.filter((w) => toneName(w.tone) === 'springs').length} springs, ${SEASON.filter((w) => toneName(w.tone) === 'neaps').length} neaps, ${SEASON.filter((w) => toneName(w.tone) === 'mixed').length} mixed`);

// The hard commercial facts the site promises to state per week.
check('every week has a departure window', SEASON.every((w) => w.departure !== null), '');
// How late an arrival can be pushed, and how early a departure. These are the two facts the
// booking page promises before payment, so they are checked rather than described.
const latestArrival = Math.max(...SEASON.map((w) => w.arrival.from - w.days[0].origin));
const earliestDepartureEnd = Math.min(...SEASON.map((w) => w.departure.to - Math.floor(w.departure.to / 24) * 24));
check('the tide can push an arrival past 18:00', latestArrival >= 18, `latest is ${Math.floor(latestArrival)}:${String(Math.round((latestArrival % 1) * 60)).padStart(2, '0')}`);
check('the tide can force a departure before 07:00', earliestDepartureEnd < 7, `earliest last crossing ends ${Math.floor(earliestDepartureEnd)}:${String(Math.round((earliestDepartureEnd % 1) * 60)).padStart(2, '0')}`);
check(
  'some departures are before 08:00',
  SEASON_FACTS.earlyDepartures.length > 0,
  `${SEASON_FACTS.earlyDepartures.length} weeks; earliest last-crossing ends ${SEASON_FACTS.earlyDepartures.map((w) => span(w.departure)).slice(0, 3).join(', ')}`,
);

// springNeap is measured from the heights, so it cannot disagree with them. Prove it.
const sample = Array.from({ length: 400 }, (_, i) => i * 3);
const ranges = sample.map((h) => {
  let lo = Infinity, hi = -Infinity;
  for (let t = h; t <= h + 25; t += 1 / 6) { const v = height(t); if (v < lo) lo = v; if (v > hi) hi = v; }
  return { sn: springNeap(h), range: hi - lo };
});
const sorted = [...ranges].sort((a, b) => a.sn - b.sn);
check(
  'springNeap is monotonic in the actual tidal range',
  sorted.every((r, i) => i === 0 || r.range >= sorted[i - 1].range - 1e-9),
  `range at sn=0 is ${sorted[0].range.toFixed(2)}m, at sn=1 is ${sorted.at(-1).range.toFixed(2)}m`,
);

// The house rule that arrivals are clipped rather than discarded.
const clipped = SEASON.filter((w) => w.arrival && w.arrival.from - w.days[0].origin === 15);
check('arrival windows are clipped to 15:00, not discarded', clipped.length > 0, `${clipped.length} weeks start exactly at 15:00`);

console.log(`\n${fail.length === 0 ? 'ALL CHECKS PASSED' : `${fail.length} FAILED:\n  ${fail.join('\n  ')}`}`);
process.exitCode = fail.length ? 1 : 0;
