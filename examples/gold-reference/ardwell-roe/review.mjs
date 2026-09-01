import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const criteria = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const images = process.argv.slice(3);
if (!images.length) { console.error('no images'); process.exit(1); }

// Deliberately neutral. The reviewer is not told the site is a benchmark, who built it, or
// that anything is hoped for — a critic who knows the answer that would be convenient is not
// an independent critic. It is told the business and the criteria, and nothing else.
const prompt = `You are reviewing a website for a client, as an experienced design director would.

THE BUSINESS
Ardwell & Roe — an architecture and interior-architecture studio in Bristol, England, founded
2011, eleven people, working across the South West and South Wales on private houses,
hospitality interiors, workplaces and the reuse of buildings built for something else. They
take a small number of projects at a time and state that they prefer repairing and extending
what exists to replacing it. Their audience is private clients with a difficult building and
often a planning refusal behind them, hospitality operators, and institutional clients with a
constrained budget. The conversion goal is a small number of well-qualified enquiries, not
volume.

THE IMAGES
${images.map((f, i) => `${i + 1}. ${f.split('/').pop()}`).join('\n')}
Filenames carry the page and the viewport. Judge the mobile renders as mobile design, not as
narrow desktop.

SCORE each criterion from 0 to 10, where 5 is a competent commercial template, 7 is good
professional work, and 9 is the work of a strong design team that a design-literate client
would notice. Be exacting. Do not inflate.

${criteria.map((c) => `- ${c.id}: ${c.question}`).join('\n')}

Reply with JSON only, no prose outside it:
{"scores":{"<criterion-id>":<number>,...},
 "strengths":["..."],
 "defects":[{"criterion":"<id>","severity":"blocker|major|minor","detail":"..."}],
 "verdict":"pass|rework|reject",
 "summary":"two or three sentences"}`;

const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-i', ...images];
const result = spawnSync('codex', args, { input: prompt, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
if (result.error) { console.error('codex failed:', result.error.message); process.exit(1); }
if (result.status !== 0) { console.error(`codex exited ${result.status}:`, String(result.stderr).slice(-800)); process.exit(1); }
console.log(String(result.stdout));
