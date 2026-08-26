export const recipe = { id: 'seo', label: 'SEO defaults' };

/**
 * Page metadata, generated rather than assembled in a browser.
 *
 * The application renderer's implementation of this capability writes the
 * title, description and canonical link into `document.head` after the app has
 * booted. That is the only thing it can do when the shipped document is an
 * empty root, and it means a crawler, a link preview and a reader-mode parser
 * all see the template's placeholder title.
 *
 * On the static renderer there is nothing to assemble: every route is its own
 * document, so its metadata is in the bytes the server sent.
 */
export { default as Head } from './Head.astro';
