import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Keep the Console's own module graph out of the preview frame.
 *
 * A generated preview is mounted at `/preview/<id>/` on this origin, and its
 * dev server serves its module graph from the server root rather than from that
 * base — Astro applies `--base` to routes but not to Vite's own client, its
 * imported stylesheets or its dependency pre-bundles. Those requests therefore
 * leave the mount and arrive here, where a path that happens to exist in the
 * Console is answered with the Console's file: the preview frame was loading
 * this application's stylesheet and its HMR client into a generated site.
 *
 * A built Console answers those paths with a 404, so this makes the dev server
 * behave the way the deployed one already does. It is deliberately decided by
 * where the request came from rather than by what it asks for: nothing the
 * Console serves belongs inside a preview, whatever it is called.
 */
function refusePreviewFrameRequests() {
  return {
    name: 'app-builder-preview-isolation',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string; headers: Record<string, string | string[] | undefined> }, res: { statusCode: number; end: (body?: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (url.startsWith('/preview/')) return next();
        const referer = request.headers.referer;
        const from = Array.isArray(referer) ? referer[0] : referer;
        if (!from) return next();
        try {
          if (!new URL(from).pathname.startsWith('/preview/')) return next();
        } catch {
          return next();
        }
        response.statusCode = 404;
        response.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), refusePreviewFrameRequests()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4310',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Generated previews are served through the Console origin at the same
      // path the factory serves them on, so every asset and route the generated
      // app emits resolves without a host-loopback address. No rewrite: the
      // path must match on both sides or the generated app's own base breaks.
      '/preview': {
        target: 'http://127.0.0.1:4310',
        changeOrigin: false,
        ws: true,
      },
    },
  },
});
