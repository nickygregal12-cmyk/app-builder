import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
