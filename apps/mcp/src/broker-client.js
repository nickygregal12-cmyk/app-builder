/**
 * Broker transport for the MCP adapter.
 *
 * The adapter's job does not change: it is still a thin protocol shim over the
 * Factory tool contract. What changes is where it sends the call when it is
 * running inside an untrusted task sandbox.
 *
 * On the host, the adapter speaks HTTP to the loopback Factory service. Inside
 * a sandbox there is no network namespace and no loopback Factory to speak to;
 * the only Factory reach is a Unix socket bind-mounted from the trusted side.
 * This client speaks to that socket, and it addresses operations *by name* —
 * it never constructs a Factory URL, because inside the sandbox there is no
 * Factory URL to construct.
 *
 * The grant it presents is attempt-scoped and signed by the control plane. The
 * adapter cannot mint one, cannot widen one and cannot read the signing key, so
 * a compromised adapter is bounded by the same capability set as the task that
 * launched it.
 */

import http from 'node:http';

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const BROKER_ENDPOINT = '/operation';
export const GRANT_HEADER = 'x-app-builder-grant';

function projectId(value) {
  if (typeof value !== 'string' || !PROJECT_ID.test(value)) throw new Error('projectId must be a bounded project identifier.');
  return value;
}

export class AgentBrokerClient {
  constructor({ socketPath = process.env.APP_BUILDER_AGENT_BROKER_SOCKET, grant = process.env.APP_BUILDER_AGENT_GRANT, timeoutMs = 120_000 } = {}) {
    if (typeof socketPath !== 'string' || !socketPath.trim()) throw new Error('The agent broker socket path is required.');
    if (typeof grant !== 'string' || !grant.trim()) {
      throw new Error('An agent capability grant is required. The broker refuses an unauthenticated caller, so starting without one would only fail later.');
    }
    this.socketPath = socketPath;
    this.grant = grant;
    this.timeoutMs = timeoutMs;
  }

  call(operation, { projectId: id = null, ...args } = {}) {
    const body = JSON.stringify({ operation, projectId: id, arguments: args });
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          socketPath: this.socketPath,
          path: BROKER_ENDPOINT,
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), [GRANT_HEADER]: this.grant },
          timeout: this.timeoutMs,
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed = null;
            try {
              parsed = text ? JSON.parse(text) : {};
            } catch {
              reject(new Error(`Agent broker returned non-JSON HTTP ${response.statusCode}.`));
              return;
            }
            if (response.statusCode === 403) {
              // A deny is a refusal to perform the operation, never a hint
              // about a route that might work instead.
              reject(new Error(`Agent capability denied: ${parsed.reason ?? 'denied'}`));
              return;
            }
            if (response.statusCode !== 200) {
              reject(new Error(`Agent broker request failed: ${parsed.message ?? parsed.error ?? `HTTP ${response.statusCode}`}`));
              return;
            }
            resolve(parsed.result);
          });
        },
      );
      request.on('timeout', () => request.destroy(new Error(`Agent broker request ${operation} timed out after ${this.timeoutMs}ms.`)));
      request.on('error', reject);
      request.end(body);
    });
  }

  listProjects() { return this.call('project.list'); }
  createProject({ manifest, knowledgePack = null, id = null }) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest must be an object.');
    if (id !== null) projectId(id);
    return this.call('project.create', { manifest, knowledgePack, id });
  }
  readProject(id) { return this.call('project.read', { projectId: projectId(id) }); }
  readManifest(id) { return this.call('project.manifest.read', { projectId: projectId(id) }); }
  readKnowledge(id) { return this.call('project.knowledge.read', { projectId: projectId(id) }); }
  readComposition(id) { return this.call('project.composition.read', { projectId: projectId(id) }); }
  readSources(id) { return this.call('project.sources.read', { projectId: projectId(id) }); }
  readOverrides(id) { return this.call('project.overrides.read', { projectId: projectId(id) }); }
  writeOverrides(id, overrides) {
    if (!Array.isArray(overrides)) throw new Error('overrides must be an array.');
    return this.call('project.overrides.write', { projectId: projectId(id), overrides });
  }
  ingestSources(id, sources) {
    if (!Array.isArray(sources) || !sources.length) throw new Error('sources must be a non-empty array.');
    return this.call('project.sources.ingest', { projectId: projectId(id), sources });
  }
  generateProject(id) { return this.call('project.generate', { projectId: projectId(id) }); }
  verifyProject(id) { return this.call('project.verify', { projectId: projectId(id) }); }
  readTasks(id) { return this.call('project.tasks.read', { projectId: projectId(id) }); }
  readEvents(id, { after = 0 } = {}) {
    if (!Number.isInteger(after) || after < 0) throw new Error('after must be a non-negative integer.');
    return this.call('project.events.read', { projectId: projectId(id), after });
  }
  readMetrics(id) { return this.call('project.metrics.read', { projectId: projectId(id) }); }
  readCheckpoint(id) { return this.call('project.checkpoint.read', { projectId: projectId(id) }); }
  readCheckpoints(id) { return this.call('project.checkpoints.read', { projectId: projectId(id) }); }
  previewStatus(id) { return this.call('project.preview.read', { projectId: projectId(id) }); }
  startPreview(id) { return this.call('project.preview.start', { projectId: projectId(id) }); }
  stopPreview(id) { return this.call('project.preview.stop', { projectId: projectId(id) }); }
  integrationStatus() { return this.call('integration.status.read'); }
}
