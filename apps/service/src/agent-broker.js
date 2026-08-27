/**
 * Trusted agent capability broker.
 *
 * This is the only Factory surface an untrusted task may reach. It exists
 * because the internal HTTP service is deliberately richer than the agent
 * surface, and "richer" is only safe while nothing untrusted can address it.
 *
 * Two properties do the work:
 *
 * 1. **There is no path to smuggle.** The broker serves exactly one endpoint
 *    and takes an operation *name*, looked up in `config/agent-capabilities.json`.
 *    A task cannot reach an unregistered operation by spelling a URL
 *    differently, double-encoding a segment, or appending a traversal — those
 *    are not inputs here. An unknown name is a deny, not a 404 from a router
 *    that might have matched something else.
 *
 * 2. **It listens on a Unix socket, not a port.** The sandbox receives that
 *    one socket file and no network namespace. `127.0.0.1:4310` is therefore
 *    not merely forbidden to the task; it is unroutable from it.
 *
 * The broker is trusted code running outside the sandbox. It authorises with
 * the provider-neutral control-plane primitives, records the decision durably,
 * and only then calls the Factory. It never returns a credential, never
 * proxies an arbitrary request, and never widens a grant.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  GrantError,
  GrantNonceRegistry,
  authoriseAgentOperation,
  createAuthorisationDecision,
  indexCapabilityRegistry,
  verifyCapabilityGrant,
} from '@app-builder/control-plane/capabilities';
import { parseSourceRequests } from './ingestion.js';

export const BROKER_ENDPOINT = '/operation';
export const GRANT_HEADER = 'x-app-builder-grant';
/**
 * The largest request body the broker will read.
 *
 * Exported, and overridable per broker, because a limit nobody can reach is a limit nobody has
 * tested: proving this one refuses at the byte it names would otherwise mean sending 48MB.
 */
export const MAX_REQUEST_BYTES = 48 * 1024 * 1024;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Operation name -> Factory call.
 *
 * Handlers call service methods directly. Nothing here accepts a route, a path
 * or a URL from the caller, so there is no construction a hostile argument can
 * turn into a different operation. The key set is asserted against the
 * capability registry at construction: a registry entry with no handler, or a
 * handler with no registry entry, fails the broker rather than silently
 * granting or withholding an operation.
 */
export const BROKER_OPERATIONS = Object.freeze({
  'project.list': async (service) => ({ projects: service.listProjects() }),
  // Creation is the one mutating operation that names a project the grant's
  // scope check cannot have compared against, because the project does not
  // exist yet. Bind it explicitly: an attempt may create the project its grant
  // names and no other, or a grant for one project would be a licence to write
  // durable state under any name the task chose.
  'project.create': async (service, { projectId, args }) => {
    if (args.id !== undefined && args.id !== null && args.id !== projectId) {
      throw new Error(`This attempt may only create ${projectId}, not ${args.id}.`);
    }
    return {
      project: service.createProject({
        manifest: args.manifest,
        knowledgePack: args.knowledgePack ?? null,
        id: projectId,
      }),
    };
  },
  'project.read': async (service, { projectId }) => ({ project: service.getProject(projectId) }),
  'project.manifest.read': async (service, { projectId }) => ({ manifest: service.getManifest(projectId) }),
  'project.knowledge.read': async (service, { projectId }) => ({ knowledgePack: service.getKnowledgePack(projectId) }),
  'project.sources.read': async (service, { projectId }) => ({ knowledge: service.knowledgeSummary(projectId) }),
  'project.sources.ingest': async (service, { projectId, args }) => service.ingestSources(projectId, parseSourceRequests(args.sources)),
  'project.composition.read': async (service, { projectId }) => ({ composition: service.getComposition(projectId) }),
  'project.overrides.read': async (service, { projectId }) => service.readOverrides(projectId),
  'project.overrides.write': async (service, { projectId, args }) =>
    service.saveOverrides(projectId, Array.isArray(args.overrides) ? args.overrides : []),
  'project.generate': async (service, { projectId }) => {
    const result = await service.generateProject(projectId);
    return {
      project: result.project,
      task: result.task,
      checkpoint: result.checkpoint,
      composition: {
        hash: result.composition.compositionHash,
        pages: result.composition.pages.length,
        sections: result.composition.sections.length,
        warnings: result.composition.warnings,
      },
    };
  },
  'project.verify': async (service, { projectId }) => service.verifyProject(projectId),
  'project.tasks.read': async (service, { projectId }) => ({ tasks: service.listTasks(projectId) }),
  'project.events.read': async (service, { projectId, args }) => {
    const after = Number(args.after ?? 0);
    if (!Number.isInteger(after) || after < 0) throw new Error('after must be a non-negative integer.');
    return { events: service.listEvents(projectId, { afterSequence: after }) };
  },
  'project.metrics.read': async (service, { projectId }) => ({ metrics: service.metrics(projectId) }),
  'project.checkpoint.read': async (service, { projectId }) => ({ checkpoint: service.latestCheckpoint(projectId) }),
  'project.checkpoints.read': async (service, { projectId }) => ({ checkpoints: service.listCheckpoints(projectId) }),
  'project.preview.read': async (service, { projectId }) => ({ preview: service.previewStatus(projectId) }),
  'project.preview.start': async (service, { projectId }) => ({ preview: await service.startPreview(projectId) }),
  'project.preview.stop': async (service, { projectId }) => ({ preview: await service.stopPreview(projectId) }),
  'integration.status.read': async (service) => ({ integrations: service.integrationStatus() }),
});

/** Operations that address one project and must resolve to a valid bounded id. */
const PROJECT_SCOPED = new Set(Object.keys(BROKER_OPERATIONS).filter((name) => name !== 'project.list' && name !== 'integration.status.read'));

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request, maxRequestBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) throw new Error('Request body exceeds the broker limit.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * The registry and the dispatch map must describe the same set of operations.
 * A capability nobody can perform is a lie in the registry; a handler nobody
 * registered is an operation outside the boundary this module exists to hold.
 */
export function assertBrokerCoversRegistry(registry) {
  const index = indexCapabilityRegistry(registry);
  const declared = new Set(index.byOperation.keys());
  const implemented = new Set(Object.keys(BROKER_OPERATIONS));
  // Internal-only first: it is the failure that matters most, and a handler for
  // a Console-only operation would otherwise be reported as the milder
  // "not declared" drift.
  for (const name of index.internalOnly) {
    if (implemented.has(name)) throw new Error(`Broker dispatches ${name}, which the registry declares internal-only.`);
  }
  const missing = [...declared].filter((name) => !implemented.has(name)).sort();
  const extra = [...implemented].filter((name) => !declared.has(name)).sort();
  if (missing.length) throw new Error(`Capability registry declares operations the broker cannot dispatch: ${missing.join(', ')}`);
  if (extra.length) throw new Error(`Broker dispatches operations the capability registry does not declare: ${extra.join(', ')}`);
  return index;
}

export function createAgentBroker({ service, registry, secret, clock = () => new Date(), maxRequestBytes = MAX_REQUEST_BYTES }) {
  const index = assertBrokerCoversRegistry(registry);
  const nonces = new GrantNonceRegistry();
  const spent = new Map();

  /**
   * Record the decision in the project's durable event ledger. A refusal that
   * only exists in a log line cannot be reviewed after the session ends, and
   * the whole point of this boundary is that it is auditable afterwards.
   */
  async function append(entry) {
    const projectId = entry.projectId;
    if (!projectId || !service.getProject(projectId)) return false;
    try {
      await service.recordOperationalEvent(
        projectId,
        entry.allowed ? 'agent.operation.allowed' : 'agent.operation.denied',
        entry,
      );
      return true;
    } catch {
      // A project that vanished between authorisation and recording must not
      // turn a deny into a throw the caller could read as a different outcome.
      return false;
    }
  }

  async function record(decision, grant) {
    const entry = createAuthorisationDecision({ decision, grant }, clock().toISOString());
    return { entry, recorded: await append(entry) };
  }

  async function handle(request, response) {
    if (request.method !== 'POST' || request.url !== BROKER_ENDPOINT) {
      // One endpoint, one method. Nothing else is routed, so there is no
      // second surface for an alternate encoding to find.
      return send(response, 404, { error: 'broker-single-endpoint', endpoint: BROKER_ENDPOINT, method: 'POST' });
    }

    const token = request.headers[GRANT_HEADER];
    let grant;
    try {
      grant = nonces.register(verifyCapabilityGrant(Array.isArray(token) ? token[0] : token, { secret, now: clock() }));
    } catch (error) {
      const reason = error instanceof GrantError ? error.reason : 'grant-malformed';
      // The event ledger is project-scoped, and a grant that failed
      // verification has no project this code may believe — its payload is
      // exactly the thing that did not verify. So a rejected caller is
      // recorded on the service's own diagnostic stream, which the host
      // journal keeps, rather than filed under a project the caller chose.
      console.error(`[agent-broker] rejected caller: ${reason} (${clock().toISOString()})`);
      await record({ allowed: false, reason, detail: error.message, operation: null, capability: null }, null);
      return send(response, 403, { error: 'denied', reason });
    }

    let body;
    try {
      body = await readJson(request, maxRequestBytes);
    } catch (error) {
      return send(response, 400, { error: 'invalid-request', message: error.message });
    }

    const operation = typeof body?.operation === 'string' ? body.operation : '';
    const requestedProject = body?.projectId === undefined || body?.projectId === null ? null : String(body.projectId);
    const decision = authoriseAgentOperation({
      grant,
      operation,
      projectId: requestedProject,
      registry: index,
      now: clock(),
      operationsSpent: spent.get(grant.attemptId) ?? 0,
    });

    if (!decision.allowed) {
      await record(decision, grant);
      return send(response, 403, { error: 'denied', reason: decision.reason, operation: operation || null });
    }

    spent.set(grant.attemptId, (spent.get(grant.attemptId) ?? 0) + 1);
    const { entry, recorded } = await record(decision, grant);

    const projectId = requestedProject ?? grant.projectId;
    if (PROJECT_SCOPED.has(operation) && !PROJECT_ID.test(projectId)) {
      return send(response, 400, { error: 'invalid-request', message: 'projectId must be a bounded project identifier.' });
    }

    try {
      const value = await BROKER_OPERATIONS[operation](service, { projectId, args: body?.arguments ?? {} });
      // A creation authorised before its project existed would otherwise be the
      // one dispatch with no durable record of who asked for it.
      if (!recorded) await append(entry);
      return send(response, 200, { operation, decisionId: entry.id, result: value });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return send(response, 500, { error: 'operation-failed', operation, decisionId: entry.id, message });
    }
  }

  const server = http.createServer((request, response) => {
    handle(request, response).catch(() => send(response, 500, { error: 'broker-failed' }));
  });
  // The broker speaks no protocol other than its one endpoint. An upgrade
  // request is a request for a different transport, and gets none.
  server.on('upgrade', (_request, socket) => socket.destroy());

  return {
    server,
    index,
    /** Bind the socket with owner-only permissions and no stale file left behind. */
    async listen(socketPath) {
      const resolved = path.resolve(socketPath);
      await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
      await fs.promises.rm(resolved, { force: true });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(resolved, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      await fs.promises.chmod(resolved, 0o600);
      return resolved;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
