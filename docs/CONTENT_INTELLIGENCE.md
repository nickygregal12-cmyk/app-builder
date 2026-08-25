# Content and Asset Intelligence

## Boundary

Phase 3 normalizes messy source material into reusable evidence. It does not ask an LLM to re-read the same PDF, spreadsheet or website on every build task.

The trusted pipeline is:

`source -> byte hash -> deterministic extractor -> content cache -> normalized source -> knowledge pack`

AI may later consume the knowledge pack for copy, design judgement or research, but extraction and provenance remain deterministic.

## Knowledge pack

The pack separates:
- `facts` — source-backed values with provenance, confidence and verification state;
- `brand` — candidate colours, font families, site titles and logo assets;
- `assets` — images/logos/screenshots plus metadata, duplicate signals and variants;
- `content` — extracted text, headings and spreadsheet tables;
- `references` — source URLs, page links and image references;
- `requirements` — source material explicitly marked as a brief/scope/requirement;
- `research` — deterministic observations such as an existing site's SEO metadata;
- `generatedCopy` — deliberately separate and empty until a later generative stage creates copy.

A source-derived candidate is never silently promoted to a verified business fact.

## Supported sources

Text, Markdown, JSON, HTML, CSV, PDF, DOCX, XLSX and common image formats are supported. Unknown binary files are inventoried but fail closed to a `binary` extraction rather than inventing content.

Remote URL intake accepts HTTP(S) only and rejects obvious localhost/private-IP targets. A future hosted service should additionally enforce network-level egress controls.

## Resource bounds

Defaults:
- 40 MB maximum source size;
- 250,000 extracted text characters per source;
- 500 spreadsheet rows per sheet;
- 60 spreadsheet columns;
- 15 second remote request timeout.

Truncation is recorded explicitly.

## Images

Image intake records dimensions, format, alpha, aspect ratio, dominant colour, a small visual fingerprint and low-resolution status.

The optimiser retains the original source and creates responsive WebP/AVIF widths plus optional 16:9 hero, 4:3 card and square crop candidates. Crop candidates are marked `reviewBeforePublish`; they are never treated as approved replacements for the original.

## Cache

Extraction results are cached by `SHA-256(content-intelligence-version + MIME type + source-content-hash)`. The same bytes therefore do not need to be parsed—or later re-sent to AI—again unless the extractor version changes.

## CLI

```bash
npm run ingest -- \
  --input ./company/brochure.pdf \
  --input ./company/pricing.xlsx \
  --input ./company/logo.png \
  --input https://example.com \
  --out .app-builder/intake/example
```

Outputs are `normalized-sources.json`, `knowledge-pack.json` and `assets/` responsive/crop candidates. The shared cache defaults to `.app-builder/cache/content`.
