# Netlify deployment

This project is configured for Netlify with `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node: 22
- SPA routes fall back to `index.html`
- Static assets receive immutable cache headers
- Baseline browser security headers are configured

Do not commit secrets to `netlify.toml`. Configure secrets and private environment variables in Netlify's environment-variable settings or CLI. Variables prefixed `VITE_` are browser-visible and must never contain secrets.

For Git-based deployment, connect this repository to a Netlify project. Pull requests can then receive Deploy Previews and the production branch can deploy automatically.
