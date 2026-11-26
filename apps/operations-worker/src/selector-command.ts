import { D1SelectorWorkspaceProvider } from '@beauty/tenancy/adapters/d1-selector-workspace-provider';
import { ids, json, mappedError } from '@beauty/cloudflare-runtime';
import { parseDemoCatalogInput, type DemoCatalogKind } from '@beauty/contracts';
import { CreateDemoCatalog } from '@beauty/operations/modules/demo/application/create-demo-catalog';
import { D1DemoCatalogLinks } from '@beauty/operations/modules/demo/infrastructure/d1-demo-catalog-links';
import { D1CustomerRepository } from '@beauty/operations/modules/customers/infrastructure/d1-customer-repository';
import { D1ProfessionalRepository } from '@beauty/operations/modules/professionals/infrastructure/d1-professional-repository';
import { D1ServiceRepository } from '@beauty/operations/modules/services/infrastructure/d1-service-repository';
import { D1IdempotencyStore } from '@beauty/reliability/d1/d1-reliability-store';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import type { OperationsEnv } from './env.js';

/** Commands never enter through the public HTTP/authentication handlers. */
export async function selectorCommand(request: Request, env: OperationsEnv, caller: unknown): Promise<Response> {
  const { requestId, correlationId } = ids(request);
  try {
    if (caller !== 'beauty-management-web') throw new Error('PERMISSION_DENIED');
    if (env.SELECTOR_DEMO_WRITES_ENABLED !== 'true') throw new Error('DEMO_WRITES_DISABLED');
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/tenants\/([A-Za-z0-9_-]{1,128})\/(customers|professionals|services)$/);
    if (!match || request.method !== 'POST' || url.search) throw new Error('DEMO_COMMAND_NOT_SUPPORTED');
    if (request.headers.has('authorization') || request.headers.get('x-tenant-id') !== match[1]) throw new Error('PERMISSION_DENIED');
    const context = await new D1SelectorWorkspaceProvider(env.D1_DATABASE, env.SELECTOR_DEMO_TENANT_IDS)
      .resolve(match[1], request.headers.get('x-workspace-role'), request.headers.get('x-professional-id') ?? undefined, true);
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    const sessionId = request.headers.get('x-demo-session-id') ?? '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey)) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error('VALIDATION_ERROR');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('VALIDATION_ERROR');
    const raw = await request.text();
    if (raw.length > 32_768) throw new Error('VALIDATION_ERROR');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new Error('VALIDATION_ERROR'); }
    const input = parseDemoCatalogInput(match[2] as DemoCatalogKind, body);
    const app = new CreateDemoCatalog(new D1CustomerRepository(env.D1_DATABASE), new D1ProfessionalRepository(env.D1_DATABASE),
      new D1ServiceRepository(env.D1_DATABASE), new D1DemoCatalogLinks(), new D1UnitOfWork(env.D1_DATABASE), new D1IdempotencyStore(env.D1_DATABASE));
    const data = await app.execute(input, { ...context, role: context.selectedRole, idempotencyKey, sessionId, requestId, correlationId });
    return json({ data, requestId, correlationId }, 201);
  } catch (error) { return mappedError(error, requestId, correlationId); }
}
