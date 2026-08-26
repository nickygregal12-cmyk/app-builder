import http from 'node:http';
import net from 'node:net';

// The remote operator's browser must never be handed a factory-host loopback
// address. It asks the Console for `/preview/<projectId>/…`; the Console
// forwards that to this service unchanged, and this module is the only thing
// that knows which loopback port a project's preview is actually on.
//
// The caller therefore never chooses a destination. A request names a project;
// the factory's own preview state names the port. An unknown project, a
// stopped preview or a stale one fails closed with 404, so this can never
// become a general localhost proxy.

const PREVIEW_ROOT = '/preview/';
const PROXYABLE_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);

// Hop-by-hop headers belong to a single connection and must not be forwarded.
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

export function previewProxyRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith(PREVIEW_ROOT)) return null;
  const remainder = pathname.slice(PREVIEW_ROOT.length);
  const separator = remainder.indexOf('/');
  const rawProjectId = separator === -1 ? remainder : remainder.slice(0, separator);
  if (!rawProjectId) return null;
  let projectId;
  try { projectId = decodeURIComponent(rawProjectId); } catch { return null; }
  // A project id is an opaque factory identifier, never a path. Anything that
  // could traverse or address a host is rejected before it reaches the service.
  if (!/^[A-Za-z0-9._-]+$/.test(projectId) || projectId === '.' || projectId === '..') return null;
  const rest = separator === -1 ? '' : remainder.slice(separator + 1);
  // The pathname reaching here is already dot-segment normalised, so this is
  // defence in depth: nothing that could climb out of the preview base is
  // forwarded, whatever a caller managed to smuggle through the parser.
  if (rest.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return { projectId, rest };
}

function forwardableHeaders(headers, port) {
  const next = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    if (name.toLowerCase() === 'host') continue;
    next[name] = value;
  }
  next.host = `127.0.0.1:${port}`;
  return next;
}

function refuse(response, status, error) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error }));
}

/**
 * Resolve the loopback preview a request is allowed to reach.
 *
 * `service.previewTarget` is the only source of a destination, so a caller
 * cannot name a host or a port. The reserved-port check is defence in depth:
 * a preview is spawned on a factory-allocated ephemeral port, and the factory's
 * own control surfaces are never a legitimate preview destination.
 */
export function resolvePreviewTarget(service, projectId, { reservedPorts = [] } = {}) {
  let target = null;
  try { target = service.previewTarget(projectId); } catch { return null; }
  if (!target || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535) return null;
  if (reservedPorts.includes(target.port)) return null;
  return target;
}

export function createPreviewProxy({ service, reservedPorts = [] }) {
  function handleRequest(request, response, route, url) {
    if (!PROXYABLE_METHODS.has(request.method ?? '')) return refuse(response, 405, 'preview-method-not-allowed');
    const target = resolvePreviewTarget(service, route.projectId, { reservedPorts });
    if (!target) return refuse(response, 404, 'preview-not-running');

    // The upstream path is rebuilt from the factory-owned base plus the
    // remainder of the operator's path, so an absolute URL in the incoming
    // request cannot redirect the proxy anywhere else.
    const upstreamPath = `${target.basePath}${route.rest}${url.search}`;
    const upstream = http.request({
      host: '127.0.0.1',
      port: target.port,
      method: request.method,
      path: upstreamPath,
      headers: forwardableHeaders(request.headers, target.port),
    }, (upstreamResponse) => {
      const headers = {};
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (HOP_BY_HOP.has(name.toLowerCase())) continue;
        headers[name] = value;
      }
      response.writeHead(upstreamResponse.statusCode ?? 502, headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) refuse(response, 502, 'preview-unreachable');
      else response.destroy();
    });
    request.pipe(upstream);
    request.on('aborted', () => upstream.destroy());
  }

  // Vite's dev client opens an HMR websocket at the same origin and base path.
  // Without this the preview still renders, but every operator session logs a
  // failing socket, so the upgrade is proxied to the same fixed destination.
  function handleUpgrade(request, socket, head) {
    let url;
    try { url = new URL(request.url ?? '/', 'http://127.0.0.1'); } catch { socket.destroy(); return false; }
    const route = previewProxyRoute(url.pathname);
    if (!route) return false;
    const target = resolvePreviewTarget(service, route.projectId, { reservedPorts });
    if (!target) { socket.end('HTTP/1.1 404 Not Found\r\nconnection: close\r\n\r\n'); return true; }

    const upstreamPath = `${target.basePath}${route.rest}${url.search}`;
    const upstream = net.connect(target.port, '127.0.0.1', () => {
      const lines = [`GET ${upstreamPath} HTTP/1.1`];
      for (const [name, value] of Object.entries(request.headers)) {
        if (name.toLowerCase() === 'host') continue;
        for (const item of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${item}`);
      }
      lines.push(`host: 127.0.0.1:${target.port}`, '', '');
      upstream.write(lines.join('\r\n'));
      if (head?.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    // A stopped preview must tear the operator's socket down with it rather
    // than leaving the Console writing into a closed connection.
    upstream.on('error', () => socket.destroy());
    upstream.on('close', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
    return true;
  }

  return { handleRequest, handleUpgrade };
}
