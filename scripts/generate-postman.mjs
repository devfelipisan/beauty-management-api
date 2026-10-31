import ts from 'typescript';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const output = 'postman';
await mkdir(output, { recursive: true });
const values = new Map(Object.entries({
  operationsUrl: 'http://localhost:8787', clinicalUrl: 'http://localhost:8788',
  billingUrl: 'http://localhost:8789', token: 'actor-dev-admin',
  tenantId: 'tenant-dev-001', customerId: 'mock-customer-maria',
  professionalId: 'mock-professional-ana', serviceId: 'mock-service-consulta',
  startsAt: '', rescheduleStartsAt: '',
}));
let manifest;
try {
  manifest = JSON.parse(await readFile('.local/mock-data/manifest.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (manifest?.scenarios?.[0]?.body) {
  for (const [key, value] of Object.entries(manifest.scenarios[0].body)) {
    if (values.has(key)) values.set(key, String(value));
  }
}
function variable(name) {
  if (!values.has(name)) values.set(name, '');
  return `{{${name}}}`;
}
function sample(schema, api, key = '') {
  if (schema.$ref) return sample(api.components.schemas[schema.$ref.split('/').at(-1)], api, key);
  if (key.endsWith('Id')) return variable(key);
  if (key === 'startsAt') return variable('startsAt');
  if (schema.example !== undefined) return schema.example;
  if (schema.enum) return schema.enum[0];
  if (schema.oneOf) return sample(schema.oneOf[0], api, key);
  if (schema.type === 'object') return Object.fromEntries((schema.required ?? []).map(name => [name, sample(schema.properties[name], api, name)]));
  if (schema.type === 'array') return [sample(schema.items, api)];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  return '';
}
async function loadContract(path) {
  let source = await readFile(path, 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)];
  for (const match of imports) {
    const target = match[1] === '@beauty/cloudflare-runtime/openapi'
      ? new URL('../packages/cloudflare-runtime/src/openapi.ts', import.meta.url)
      : new URL(match[1].replace(/\.js$/, '.ts'), path);
    const url = await loadContract(target);
    source = source.replace(`from '${match[1]}'`, `from '${url}'`);
  }
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(result.outputText).toString('base64')}`;
}
const script = (listen, lines) => ({ listen, script: { type: 'text/javascript', exec: lines } });
for (const worker of ['operations', 'clinical', 'billing']) {
  const module = await import(await loadContract(new URL(`../apps/${worker}-worker/src/openapi.ts`, import.meta.url)));
  const api = module[`${worker}OpenApi`];
  const folders = new Map();
  for (const [path, methods] of Object.entries(api.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const group = op.tags?.[0] ?? 'API';
      if (!folders.has(group)) folders.set(group, []);
      const headers = [];
      const parameters = [];
      const pre = [];
      for (const param of op.parameters ?? []) {
        if (param.in === 'path') variable(param.name);
        if (param.in === 'query') parameters.push({ key: param.name, value: param.schema.enum?.[0] ?? variable(param.name), disabled: !param.required });
        if (param.in === 'header') {
          if (['Idempotency-Key', 'x-request-id', 'x-correlation-id'].includes(param.name)) {
            const key = `${op.operationId}_${param.name.replaceAll('-', '_')}`;
            headers.push({ key: param.name, value: variable(key) });
            pre.push(`if (!pm.environment.get('${key}')) pm.environment.set('${key}', pm.variables.replaceIn('{{$guid}}'));`);
          } else headers.push({ key: param.name, value: variable(param.name), disabled: !param.required });
        }
      }
      const request = {
        method: method.toUpperCase(), header: headers,
        url: { raw: `{{${worker}Url}}${path.replace(/\{([^}]+)\}/g, (_, name) => variable(name))}${parameters.length ? '?' + parameters.map(p => `${p.key}=${p.value}`).join('&') : ''}`, host: [`{{${worker}Url}}`], path: path.slice(1).split('/').map(part => part.replace(/\{([^}]+)\}/g, (_, name) => variable(name))), query: parameters },
        description: `${op.description ?? ''}\n\nExemplo de corpo é estrutural: preencher valores de negócio antes de enviar.`,
        ...(op.security?.length === 0 ? { auth: { type: 'noauth' } } : {}),
      };
      const content = op.requestBody?.content;
      if (content?.['application/json']) {
        const body = sample(content['application/json'].schema, api);
        if (op.operationId === 'createAppointment') body.origin = 'RECEPTION';
        if (op.operationId === 'rescheduleAppointment') body.startsAt = variable('rescheduleStartsAt');
        if (op.operationId === 'registerPayment') body.customerId = variable('customerId');
        request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
        headers.push({ key: 'Content-Type', value: 'application/json' });
      } else if (content) {
        request.body = { mode: 'file', file: {} };
        headers.push({ key: 'Content-Type', value: 'image/jpeg' });
      }
      const expected = Number(Object.keys(op.responses).find(status => /^2\d\d$/.test(status)));
      const tests = [`pm.test('Status esperado: ${expected}', () => pm.response.to.have.status(${expected}));`];
      const capture = { createAppointment: ['appointmentId', 'appointmentId'], startSession: ['sessionId', 'sessionId'], createService: ['serviceId', 'id'], createEquipment: ['equipmentId', 'id'], createTechnicalForm: ['formId', 'id'], uploadSessionPhoto: ['photoId', 'id'], registerPayment: ['paymentId', 'paymentId'] }[op.operationId];
      if (capture) tests.push(`if (pm.response.code >= 200 && pm.response.code < 300) { const data = pm.response.json().data; const id = data?.['${capture[1]}'] ?? data?.id; if (id) pm.environment.set('${capture[0]}', id); }`);
      folders.get(group).push({ name: `${request.method} — ${op.summary}`, request, event: [...(pre.length ? [script('prerequest', pre)] : []), script('test', tests)], response: [] });
    }
  }
  const collection = {
    info: { name: api.info.title, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: `${api.info.description}\n\nGerada por node scripts/generate-postman.mjs. Selecionar Beauty — Local. Executar requisições individualmente: não executar todas as mutações em sequência indiscriminadamente.` },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    item: [...folders].map(([name, item]) => ({ name, item })),
  };
  await writeFile(`${output}/${worker}.postman_collection.json`, JSON.stringify(collection, null, 2) + '\n');
  console.log(`${worker}: ${[...folders.values()].flat().length} requisições`);
}
for (const name of ['appointmentId', 'sessionId', 'receivableId', 'paymentId', 'customerPackageId', 'equipmentId', 'formId', 'photoId', 'alertId']) variable(name);
await writeFile(`${output}/local.postman_environment.json`, JSON.stringify({ name: 'Beauty — Local', values: [...values].map(([key, value]) => ({ key, value, type: key === 'token' ? 'secret' : 'default', enabled: true })), _postman_variable_scope: 'environment' }, null, 2) + '\n');
