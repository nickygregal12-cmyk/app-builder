import http from 'node:http';

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request, maxBytes = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body exceeds the local service limit.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function projectRoute(pathname) {
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/(generate|tasks|events|metrics|checkpoint))?$/);
  return match ? { projectId: decodeURIComponent(match[1]), action: match[2] ?? null } : null;
}

export function createFactoryHttpServer({ service }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true, service: 'app-builder', version: 1 });
      if (request.method === 'GET' && url.pathname === '/projects') return send(response, 200, { projects: service.listProjects() });
      if (request.method === 'POST' && url.pathname === '/projects') {
        const body = await readJson(request);
        const project = service.createProject({ manifest: body.manifest, knowledgePack: body.knowledgePack ?? null, id: body.id ?? null });
        return send(response, 201, { project });
      }

      const route = projectRoute(url.pathname);
      if (!route) return send(response, 404, { error: 'not-found' });
      const project = service.getProject(route.projectId);
      if (!project) return send(response, 404, { error: 'unknown-project' });

      if (request.method === 'GET' && route.action === null) return send(response, 200, { project });
      if (request.method === 'POST' && route.action === 'generate') {
        const result = await service.generateProject(route.projectId);
        return send(response, 200, {
          project: result.project,
          task: result.task,
          checkpoint: result.checkpoint,
          composition: { hash: result.composition.compositionHash, pages: result.composition.pages.length, sections: result.composition.sections.length, warnings: result.composition.warnings },
        });
      }
      if (request.method === 'GET' && route.action === 'tasks') return send(response, 200, { tasks: service.listTasks(route.projectId) });
      if (request.method === 'GET' && route.action === 'events') {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isInteger(after) || after < 0) return send(response, 400, { error: 'invalid-after-sequence' });
        return send(response, 200, { events: service.listEvents(route.projectId, { afterSequence: after }) });
      }
      if (request.method === 'GET' && route.action === 'metrics') return send(response, 200, { metrics: service.metrics(route.projectId) });
      if (request.method === 'GET' && route.action === 'checkpoint') return send(response, 200, { checkpoint: service.latestCheckpoint(route.projectId) });
      return send(response, 405, { error: 'method-not-allowed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /JSON|manifest|knowledge-pack|Request body|Unsafe/.test(message) ? 400 : 500;
      return send(response, status, { error: 'request-failed', message });
    }
  });
}
