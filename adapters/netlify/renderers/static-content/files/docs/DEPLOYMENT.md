# Netlify deployment

This project is configured for Netlify with `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node: 22
- Every route is a real document, so there is no catch-all rewrite. An address
  that matches no file is served `404.html`, which is the not-found surface the
  composition produced.
- Static assets receive immutable cache headers
- Baseline browser security headers are configured

Do not commit secrets to `netlify.toml`. Configure secrets and private environment variables in Netlify's environment-variable settings or CLI. Variables prefixed `PUBLIC_` are browser-visible and must never contain secrets.

For Git-based deployment, connect this repository to a Netlify project. Pull requests can then receive Deploy Previews and the production branch can deploy automatically.

Netlify is one host, not a requirement of the build. The renderer produces an
ordinary directory of static files; another static host needs its own
configuration file and nothing else from this repository.
