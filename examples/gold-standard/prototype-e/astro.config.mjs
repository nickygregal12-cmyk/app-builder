import { defineConfig } from 'astro/config';
export default defineConfig({
  // No integrations. The product demonstrations are hand-authored SVG and a small amount of
  // vanilla script; a framework runtime here would ship a client bundle to render a drawing
  // that never changes shape.
  build: { inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
