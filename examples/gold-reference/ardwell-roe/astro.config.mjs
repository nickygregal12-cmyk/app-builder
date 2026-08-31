import { defineConfig } from 'astro/config';

// Static output, no islands, no client JS framework. The factory's marketing renderer is
// the same class of thing, deliberately: if this prototype beat it by being a React app,
// the finding would be about frameworks rather than about design vocabulary.
export default defineConfig({
  output: 'static',
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
});
