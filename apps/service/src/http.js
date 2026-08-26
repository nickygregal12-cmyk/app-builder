import fs from 'node:fs';
import http from 'node:http';
import { parseSourceRequests } from './ingestion.js';
import { factoryToolContract } from './tool-contract.js';
import { updateProjectSourceGovernance } from './source-governance.js';
import { assetInventory, decideProjectAsset, recropProjectAsset } from './asset-governance.js';
import { chooseSectionVariant, sectionVariantOptions } from './section-variants.js';

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
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/(.+))?$/);
  return match ? { projectId: decodeURIComponent(match[1]), action: match[2] ?? null } : null;
}

export function createFactoryHttpServer({ service }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true, service: 'app-builder', version: 2 });
      if (request.method === 'GET' && url.pathname === '/tools') return send(response, 200, factoryToolContract());
      if (request.method === 'GET' && url.pathname === '/integrations') return send(response, 200, { integrations: service.integrationStatus() });
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

      const sourceGovernanceRoute = route.action?.match(/^sources\/([^/]+)\/governance$/);
      if (request.method === 'POST' && sourceGovernanceRoute) {
        const body = await readJson(request);
        const result = await updateProjectSourceGovernance(service, route.projectId, decodeURIComponent(sourceGovernanceRoute[1]), body.decision);
        return send(response, 200, result);
      }

      if (request.method === 'GET' && route.action === null) return send(response, 200, { project });
      if (request.method === 'GET' && route.action === 'manifest') return send(response, 200, { manifest: service.getManifest(route.projectId) });
      if (request.method === 'GET' && route.action === 'knowledge-pack') return send(response, 200, { knowledgePack: service.getKnowledgePack(route.projectId) });
      if (request.method === 'GET' && route.action === 'sources') return send(response, 200, { knowledge: service.knowledgeSummary(route.projectId) });
      if (request.method === 'POST' && route.action === 'sources') {
        // Uploaded bytes arrive base64-encoded, so the body limit is raised
        // above the ordinary JSON ceiling but stays bounded.
        const body = await readJson(request, 48 * 1024 * 1024);
        const result = await service.ingestSources(route.projectId, parseSourceRequests(body.sources));
        return send(response, 200, result);
      }
      if (request.method === 'GET' && route.action === 'composition') return send(response, 200, { composition: service.getComposition(route.projectId) });
      if (request.method === 'GET' && route.action === 'element-identity') return send(response, 200, { index: service.elementIdentityIndex(route.projectId) });
      if (request.method === 'POST' && route.action === 'element-identity/resolve') {
        const body = await readJson(request);
        return send(response, 200, service.resolveElement(route.projectId, body.ref ?? body));
      }
      if (request.method === 'GET' && route.action === 'assets') return send(response, 200, { assets: assetInventory(service, route.projectId), assetDecisionsHash: service.assetDecisionsHash(route.projectId) });
      const assetPreviewRoute = route.action?.match(/^assets\/([^/]+)\/preview$/);
      if (request.method === 'GET' && assetPreviewRoute) {
        const found = service.readAssetPreview(route.projectId, decodeURIComponent(assetPreviewRoute[1]));
        if (!found) return send(response, 404, { error: 'unknown-asset' });
        const bytes = fs.readFileSync(found.file);
        response.writeHead(200, { 'content-type': found.mimeType, 'cache-control': 'no-store', 'content-length': bytes.length });
        return response.end(bytes);
      }
      const assetRecropRoute = route.action?.match(/^assets\/([^/]+)\/focal-point$/);
      if (request.method === 'POST' && assetRecropRoute) {
        const body = await readJson(request);
        return send(response, 200, await recropProjectAsset(service, route.projectId, decodeURIComponent(assetRecropRoute[1]), body.focalPoint ?? body));
      }
      const assetDecisionRoute = route.action?.match(/^assets\/([^/]+)\/decision$/);
      if (request.method === 'POST' && assetDecisionRoute) {
        const body = await readJson(request);
        return send(response, 200, await decideProjectAsset(service, route.projectId, decodeURIComponent(assetDecisionRoute[1]), body));
      }
      if (request.method === 'GET' && route.action === 'section-variants') return send(response, 200, { sections: sectionVariantOptions(service, route.projectId) });
      const variantRoute = route.action?.match(/^sections\/([^/]+)\/variant$/);
      if (request.method === 'POST' && variantRoute) {
        const body = await readJson(request);
        await chooseSectionVariant(service, route.projectId, decodeURIComponent(variantRoute[1]), body.variant ?? null);
        return send(response, 200, { sections: sectionVariantOptions(service, route.projectId) });
      }
      if (request.method === 'GET' && route.action === 'evidence') return send(response, 200, { evidence: service.listRenderedEvidence(route.projectId) });
      if (request.method === 'POST' && route.action === 'evidence/capture') {
        const result = await service.captureRenderedEvidence(route.projectId);
        return send(response, 200, { evidence: result?.evidence ?? null, failures: result?.failures ?? [] });
      }
      const captureRoute = route.action?.match(/^evidence\/([^/]+)\/captures\/([^/]+)$/);
      if (request.method === 'GET' && captureRoute) {
        const found = service.readRenderedCapture(route.projectId, decodeURIComponent(captureRoute[1]), decodeURIComponent(captureRoute[2]));
        if (!found) return send(response, 404, { error: 'unknown-capture' });
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-length': found.bytes.length });
        return response.end(found.bytes);
      }
      if (request.method === 'GET' && route.action === 'overrides') return send(response, 200, service.readOverrides(route.projectId));
      if (request.method === 'PUT' && route.action === 'overrides') {
        const body = await readJson(request);
        return send(response, 200, await service.saveOverrides(route.projectId, Array.isArray(body.overrides) ? body.overrides : []));
      }
      if (request.method === 'POST' && route.action === 'generate') {
        const result = await service.generateProject(route.projectId);
        return send(response, 200, {
          project: result.project,
          task: result.task,
          checkpoint: result.checkpoint,
          composition: { hash: result.composition.compositionHash, pages: result.composition.pages.length, sections: result.composition.sections.length, warnings: result.composition.warnings },
        });
      }
      if (request.method === 'POST' && route.action === 'verify') {
        const result = await service.verifyProject(route.projectId);
        return send(response, 200, result);
      }
      if (request.method === 'GET' && route.action === 'tasks') return send(response, 200, { tasks: service.listTasks(route.projectId) });
      if (request.method === 'GET' && route.action === 'events') {
        const after = Number(url.searchParams.get('after') ?? 0);
        if (!Number.isInteger(after) || after < 0) return send(response, 400, { error: 'invalid-after-sequence' });
        return send(response, 200, { events: service.listEvents(route.projectId, { afterSequence: after }) });
      }
      if (request.method === 'GET' && route.action === 'metrics') return send(response, 200, { metrics: service.metrics(route.projectId) });
      if (request.method === 'GET' && route.action === 'checkpoint') return send(response, 200, { checkpoint: service.latestCheckpoint(route.projectId) });
      if (request.method === 'GET' && route.action === 'checkpoints') return send(response, 200, { checkpoints: service.listCheckpoints(route.projectId) });
      if (request.method === 'GET' && route.action === 'preview') return send(response, 200, { preview: service.previewStatus(route.projectId) });
      if (request.method === 'POST' && route.action === 'preview/start') return send(response, 200, { preview: await service.startPreview(route.projectId) });
      if (request.method === 'POST' && route.action === 'preview/stop') return send(response, 200, { preview: await service.stopPreview(route.projectId) });
      return send(response, 405, { error: 'method-not-allowed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Only messages that name a caller mistake become 4xx. A bare word like
      // "source" would also match internal failures and hide a real 500.
      const clientError = [
        /JSON/, /manifest/, /knowledge[ -]pack/, /Request body/, /Unsafe/,
        /Ingestion (requires|accepts)/, /^Invalid content-override/, /^Invalid composition/, /^Unresolved element identity/, /does not expose an editable/, /Rendered evidence (needs|is captured)/, /Sources cannot reference/, /Only http\(s\) source URLs/,
        /^Source \w+ (is required|must be)/, /Uploaded source/, /maxPages must be/,
        /Every source must be/, /exceeds the .* limit/,
        /dependencies are not installed/, /no generated workspace/,
        /source governance/i, /Unknown project source/, /Unknown project asset/, /^Asset \w[\w-]* (comes from|is an exact)/, /^Unsupported asset (decision|)/, /^Unsupported (crop review|rights declaration)/, /Asset decisions need/, /^Unknown project section/, /^Unsupported section variant/, /Presentation choices need/, /^A focal point needs/, /has no retained original/, /Public URL references/, /Only user-supplied source material/,
      ].some((pattern) => pattern.test(message));
      const status = clientError ? 400 : 500;
      return send(response, status, { error: 'request-failed', message });
    }
  });
}
