const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertLoopbackBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Factory service URL must use HTTP(S).');
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('MCP adapter v1 only connects to a loopback App Builder service.');
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Factory service URL must be an origin without path, credentials, query or fragment.');
  }
  return url;
}

function projectId(value) {
  if (typeof value !== 'string' || !PROJECT_ID.test(value)) throw new Error('projectId must be a bounded project identifier.');
  return value;
}

async function responseJson(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Factory service returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok) {
    const message = body?.message || body?.error || `HTTP ${response.status}`;
    throw new Error(`Factory service request failed: ${message}`);
  }
  return body;
}

export class FactoryServiceClient {
  constructor({ baseUrl = process.env.APP_BUILDER_SERVICE_URL ?? 'http://127.0.0.1:4310', fetchImpl = fetch } = {}) {
    this.baseUrl = assertLoopbackBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
  }

  async request(method, pathname, body) {
    const url = new URL(pathname, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) throw new Error('Factory service request escaped the configured origin.');
    const response = await this.fetchImpl(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return responseJson(response);
  }

  listProjects() { return this.request('GET', '/projects'); }
  createProject({ manifest, knowledgePack = null, id = null }) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest must be an object.');
    if (id !== null) projectId(id);
    return this.request('POST', '/projects', { manifest, knowledgePack, id });
  }
  readProject(id) { return this.request('GET', `/projects/${projectId(id)}`); }
  readManifest(id) { return this.request('GET', `/projects/${projectId(id)}/manifest`); }
  readKnowledge(id) { return this.request('GET', `/projects/${projectId(id)}/knowledge-pack`); }
  readComposition(id) { return this.request('GET', `/projects/${projectId(id)}/composition`); }
  readSources(id) { return this.request('GET', `/projects/${projectId(id)}/sources`); }
  ingestSources(id, sources) {
    if (!Array.isArray(sources) || !sources.length) throw new Error('sources must be a non-empty array.');
    return this.request('POST', `/projects/${projectId(id)}/sources`, { sources });
  }
  generateProject(id) { return this.request('POST', `/projects/${projectId(id)}/generate`); }
  verifyProject(id) { return this.request('POST', `/projects/${projectId(id)}/verify`); }
  readTasks(id) { return this.request('GET', `/projects/${projectId(id)}/tasks`); }
  readEvents(id, { after = 0 } = {}) {
    if (!Number.isInteger(after) || after < 0) throw new Error('after must be a non-negative integer.');
    return this.request('GET', `/projects/${projectId(id)}/events?after=${after}`);
  }
  readMetrics(id) { return this.request('GET', `/projects/${projectId(id)}/metrics`); }
  readCheckpoint(id) { return this.request('GET', `/projects/${projectId(id)}/checkpoint`); }
  previewStatus(id) { return this.request('GET', `/projects/${projectId(id)}/preview`); }
  startPreview(id) { return this.request('POST', `/projects/${projectId(id)}/preview/start`); }
  stopPreview(id) { return this.request('POST', `/projects/${projectId(id)}/preview/stop`); }
  integrationStatus() { return this.request('GET', '/integrations'); }
}
