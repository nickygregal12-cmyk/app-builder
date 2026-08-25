# Content and Asset Intelligence

## Boundary

Phase 3 normalises messy real-world source material into reusable evidence. It does not ask an LLM to re-read the same PDF, spreadsheet, website page or image on every build task.

The trusted pipeline is:

`source -> safety/size gate -> byte hash -> deterministic extractor -> content cache -> normalized source -> knowledge pack -> bounded AI-ready chunks`

AI may later consume the knowledge pack for copy, design judgement or research, but extraction, provenance and cache identity remain deterministic.

## Knowledge pack

The pack separates:
- `facts` — source-backed values with provenance, confidence, verification state and evidence;
- `companyProfile` — best-known identity/contact candidates plus source-backed services, people, projects, testimonials and accreditations;
- `brand` — observed colours, font families, site titles, logo candidates and screenshot candidates;
- `assets` — images/logos/screenshots plus metadata, duplicate signals and variants;
- `content` — extracted text, headings and spreadsheet tables;
- `chunks` — content-addressed, deduplicated, bounded text units for later AI context;
- `references` — source URLs, page links and image references;
- `requirements` — source material explicitly marked as a brief/scope/requirement;
- `research` — deterministic SEO, local-SEO and lead-generation input reports;
- `generatedCopy` — deliberately separate and empty until a later generative stage creates copy.

A source-derived candidate is never silently promoted to a verified business fact. User-provided structured company data may be marked `user-provided`; extracted emails, telephone numbers and existing-site titles remain candidates until confirmed.

## Existing websites

URL intake uses a bounded breadth-first crawl:
- HTTP(S) only;
- same-origin pages only after the initial redirect resolves;
- query strings and fragments are removed for crawl deduplication;
- obvious binary/media links are skipped;
- maximum 25 pages, default 12;
- redirect count, response time and bytes are bounded;
- localhost/private IP literals are rejected;
- hostnames are resolved before each request and rejected if any returned address is private.

This is an application-level SSRF guard. A future hosted multi-tenant service should also enforce network-level egress policy.

## Supported sources

Text, Markdown, JSON, HTML, CSV, PDF, DOCX, XLSX and common image formats are supported. Unknown binary files are inventoried but fail closed to a `binary` extraction rather than inventing content.

## Resource bounds

Defaults:
- 40 MB maximum source size;
- 250,000 extracted text characters per source;
- 500 spreadsheet rows per sheet;
- 60 spreadsheet columns;
- 15 second remote request timeout;
- 5 remote redirects.

Truncation is recorded explicitly.

## Images

Image intake records dimensions, format, alpha, aspect ratio, dominant colour, a small visual fingerprint and low-resolution status.

The optimiser retains the original source and creates responsive WebP/AVIF widths plus optional 16:9 hero, 4:3 card and square crop candidates. Crop candidates are marked `reviewBeforePublish`; they are never treated as approved replacements for the original.

Exact duplicate bytes use the source content hash. A small normalised visual fingerprint provides a second duplicate signal across differently encoded images.

## Brand, SEO and leads

Phase 3 does not invent a design direction or marketing claim. It records observed brand signals and deterministic build inputs:
- colours/font-family declarations seen in supplied pages;
- logo/screenshot candidates;
- page titles, descriptions, canonicals, H1 count, missing image alt text and JSON-LD types;
- local SEO inputs only where an address/service area/contact fact exists;
- lead-generation inputs such as available contact methods, services, testimonials and accreditations.

Generative copy and design judgement belong to later AI stages.

## Cache and AI context

Extraction results are cached by `SHA-256(content-intelligence-version + MIME type + source-content-hash)`. Changing extractor logic changes the version and invalidates stale extraction records.

Extracted text is also split into bounded content-addressed chunks. Identical chunk text across sources is stored once with multiple source IDs. This gives Phase 5 a stable unit for model-context/result caching without resending entire source files.

Transient `cacheHit` state is intentionally excluded from the semantic knowledge-pack hash, so a warm-cache rerun produces the same `packHash` as the cold run.

## CLI

```bash
npm run ingest -- \
  --input ./company/brochure.pdf \
  --input ./company/pricing.xlsx \
  --input ./company/logo.png \
  --input https://example.com \
  --max-pages 12 \
  --out .app-builder/intake/example
```

Outputs:
- `normalized-sources.json` — full operational extraction records including cache-hit state;
- `knowledge-pack.json` — stable trusted project knowledge;
- `ai-context-index.json` — chunk IDs/hashes/source IDs/token estimates;
- `source-cache-index.json` — source content/cache identities;
- `assets/` — responsive and review-required crop candidates.

The shared extraction cache defaults to `.app-builder/cache/content`.

## Service ingestion

The CLI stays useful for scripted runs, but the Builder Console and MCP clients
ingest through the factory service instead:

```text
POST /projects/{projectId}/sources
GET  /projects/{projectId}/sources
```

A request declares each source as either a public `http(s)` URL to normalise —
optionally crawled, bounded to 25 pages — or inline base64 file content. A
client can never supply a filesystem path, and the SSRF guard above still
refuses private and loopback destinations.

Ingestion runs as a durable control-plane task: `sources.ingestion.started` and
`sources.ingested` (or `sources.ingestion.failed`) reach the event ledger, and a
checkpoint records what was ingested and what to do next. It is additive —
earlier material survives a later upload, and identical bytes from the same URI
are ingested once — and it is refused only while a build is running. Composition
reads the knowledge pack at generation time, so material ingested after a build
reaches the product through a rebuild, which materialises the next workspace
version rather than overwriting the previous one.

Rights are declared, never inferred. An operator can mark supplied material
`approvedForUse` (or set `rightsStatus`/`assetStatus` explicitly); without that,
a crawled public page stays `reference-only` and `do-not-use`. Everything
imported keeps `instructionAuthority: none`.
