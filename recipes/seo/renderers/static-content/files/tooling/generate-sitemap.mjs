import fs from 'node:fs';

/**
 * A sitemap of the routes this site actually has.
 *
 * The application renderer's sitemap lists exactly one URL, and truthfully so:
 * one document is all it publishes, and every other route exists only after a
 * browser has run the application. A prerendered build has real routes, so the
 * sitemap is read from the composition the build was generated from rather than
 * from a guess about what the site might contain.
 *
 * The not-found surface is excluded. It is a route the site serves, not a page
 * anyone should be sent to.
 */
const siteUrl = process.env.SITE_URL?.replace(/\/$/, '');
if (!siteUrl) {
  console.log('SITE_URL is not set; skipping sitemap generation.');
  process.exit(0);
}

const NOT_FOUND = /(^|\/)(404|not-found)$/;

function routes() {
  try {
    const composition = JSON.parse(fs.readFileSync('.app-builder/composition.json', 'utf8'));
    const paths = (composition.pages ?? [])
      .map((page) => page.path)
      .filter((path) => typeof path === 'string' && path.startsWith('/') && !NOT_FOUND.test(path));
    return paths.length ? [...new Set(paths)].sort() : ['/'];
  } catch {
    // A repository someone cloned without factory state still deploys. One
    // honest entry beats a build that fails over a sitemap.
    return ['/'];
  }
}

const urls = routes()
  .map((route) => `  <url><loc>${siteUrl}${route === '/' ? '/' : route}</loc></url>`)
  .join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/sitemap.xml', xml);
console.log(`Generated sitemap for ${siteUrl} with ${routes().length} route(s).`);
