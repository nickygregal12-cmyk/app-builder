// @ts-check
import { defineConfig } from 'astro/config';

/**
 * A static site, stated rather than assumed.
 *
 * `output: 'static'` is Astro's default, and it is declared here anyway: this
 * template exists because the route HTML is generated at build time, so the one
 * setting that would silently undo that belongs in the file rather than in a
 * default someone could change without noticing what it cost.
 *
 * `prefetch` is deliberately off. A marketing site whose value is that a
 * visitor gets a document should not start downloading a router to feel fast.
 */
export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  prefetch: false,
});
