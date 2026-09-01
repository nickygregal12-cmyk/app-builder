/**
 * Serve `dist` for rendered capture.
 *
 * `astro preview` kept dying part-way through a four-viewport run, which produced eighteen
 * screenshots out of twenty-four and an independent reviewer correctly refusing to score a
 * submission whose images were missing. A static server that does one thing does not have
 * that failure mode.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.avif': 'image/avif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
  let file = path.join(root, pathname);
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(root, `${pathname}.html`);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end('not found'); return; }
  response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(response);
}).listen(Number(process.env.PORT ?? 4333), '127.0.0.1', () => {
  console.log(`serving dist on ${process.env.PORT ?? 4333}`);
});
