import { COLOURS } from './src/data/colours.ts';
import { inkOn, inkContrast, lrv } from './src/lib/light.ts';
const rows = COLOURS.map((c) => ({ n: c.name, lrv: lrv(c.hex), ink: inkOn(c.hex), ratio: +inkContrast(c.hex).toFixed(2) }))
  .sort((a, b) => a.ratio - b.ratio);
console.log('worst ten:');
for (const r of rows.slice(0, 10)) console.log(`  ${r.ratio.toFixed(2)}  ${r.ink.padEnd(5)} LRV ${String(r.lrv).padStart(4)}  ${r.n}`);
console.log(`\nbelow 4.5:1 : ${rows.filter((r) => r.ratio < 4.5).length}`);
console.log(`below 3.0:1 : ${rows.filter((r) => r.ratio < 3).length}`);
