import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const criteria = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const images = process.argv.slice(4);
if (!images.length) { console.error('no images'); process.exit(1); }

// Deliberately neutral. The reviewer is not told the site is a benchmark, who built it, or
// that anything is hoped for — a critic who knows the answer that would be convenient is not
// an independent critic. It is told the business and the criteria, and nothing else.
// The business brief is read from a file, not baked in. The first run of this harness on the
// second prototype still carried the first prototype's business description, and the reviewer
// correctly rejected a landscape studio for not being an architecture practice — a real defect
// in the harness that scored as a defect in the work.
const brief = fs.readFileSync(process.argv[3], 'utf8').trim();

const prompt = `You are reviewing a website for a client, as an experienced design director would.

THE BUSINESS
${brief}

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
