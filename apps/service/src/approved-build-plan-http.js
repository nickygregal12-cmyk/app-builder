import { approveProjectBuildPlan, executeApprovedProjectBuildPlan, getApprovedProjectBuildPlan, listApprovedProjectBuildPlans } from './approved-build-plan-service.js';

function assertClosedBody(body, required, allowed, label) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${label} requires a JSON object.`);
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(body, key));
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (missing.length) throw new Error(`${label} is missing required field(s): ${missing.join(', ')}.`);
  if (extra.length) throw new Error(`${label} does not accept field(s): ${extra.join(', ')}.`);
  return body;
}

function executionResponse(executed) {
  const result = executed.result ?? {};
  return {
    plan: executed.plan,
    execution: executed.execution,
    build: {
      projectId: executed.plan.projectId,
      taskId: result.task?.id ?? null,
      checkpointId: result.checkpoint?.id ?? null,
      compositionHash: result.composition?.compositionHash ?? null,
    },
  };
}

export async function handleApprovedBuildPlanHttp({ request, route, service, readJson }) {
  if (request.method === 'GET' && route.action === 'approved-build-plans') {
    return { handled: true, status: 200, value: { plans: listApprovedProjectBuildPlans(service, route.projectId) } };
  }

  if (request.method === 'POST' && route.action === 'approved-build-plans') {
    const body = assertClosedBody(
      await readJson(request),
      ['approvalId', 'confirmed'],
      ['approvalId', 'confirmed'],
      'Approved build plan approval',
    );
    const plan = await approveProjectBuildPlan(service, route.projectId, {
      approvalId: body.approvalId,
      approvalMode: 'explicit-local-operator',
      confirmed: body.confirmed,
    });
    return { handled: true, status: 201, value: { plan } };
  }

  if (request.method === 'POST' && route.action === 'approved-build-plans/execute') {
    const body = assertClosedBody(
      await readJson(request),
      ['planId', 'expectedPlanHash', 'requestId'],
      ['planId', 'expectedPlanHash', 'requestId'],
      'Approved build plan execution',
    );
    const executed = await executeApprovedProjectBuildPlan(service, route.projectId, body);
    return { handled: true, status: 200, value: executionResponse(executed) };
  }

  const readRoute = route.action?.match(/^approved-build-plans\/([^/]+)$/);
  if (request.method === 'GET' && readRoute) {
    const planId = decodeURIComponent(readRoute[1]);
    const plan = getApprovedProjectBuildPlan(service, route.projectId, planId);
    return plan
      ? { handled: true, status: 200, value: { plan } }
      : { handled: true, status: 404, value: { error: 'unknown-approved-build-plan' } };
  }

  return { handled: false };
}
