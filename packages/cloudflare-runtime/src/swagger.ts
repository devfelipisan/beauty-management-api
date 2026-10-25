import type { ApiDocument } from './openapi.js';
import {
  swaggerBundle,
  swaggerCss,
  swaggerLicense,
} from './generated/swagger-assets.js';

// Fetch adapter only: no business calls, storage, credentials or tenant state.
export function serveSwagger(
  request: Request,
  document: ApiDocument,
): Response | undefined {
  const path = new URL(request.url).pathname;
  const recognized = [
    '/swagger',
    '/swagger/',
    '/api-docs',
    '/api-docs/',
    '/openapi.json',
    '/swagger/swagger-ui-bundle.js',
    '/swagger/swagger-ui.css',
    '/swagger/init.js',
    '/swagger/LICENSE',
  ];
  if (!recognized.includes(path)) return undefined;
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  let body: string;
  let type: string;
  const limitations = Object.entries(document.paths).flatMap(
    ([path, methods]) =>
      Object.entries(methods)
        .filter(([, op]) => op['x-browser-testable'] === false)
        .map(([method, op]) => ({
          path,
          method,
          reason: op['x-browser-limitation'] ?? op.description,
        })),
  );
  switch (path) {
    case '/openapi.json':
      body = JSON.stringify(document);
      type = 'application/json';
      break;
    case '/swagger/swagger-ui-bundle.js':
      body = swaggerBundle;
      type = 'application/javascript';
      break;
    case '/swagger/swagger-ui.css':
      body = swaggerCss;
      type = 'text/css';
      break;
    case '/swagger/LICENSE':
      body = swaggerLicense;
      type = 'text/plain';
      break;
    case '/swagger/init.js':
      body = `const browserLimitations = ${JSON.stringify(limitations)};
window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true, filter: true, displayRequestDuration: true, validatorUrl: null, persistAuthorization: false, queryConfigEnabled: false, supportedSubmitMethods: ['get','post','patch','delete'], presets: [SwaggerUIBundle.presets.apis], requestInterceptor: function(request) {
  const parts = new URL(request.url, window.location.href).pathname.split('/');
  const limitation = browserLimitations.find(function(item) { const template = item.path.split('/'); return item.method === request.method.toLowerCase() && template.length === parts.length && template.every(function(part, index) { return part.startsWith('{') || part === parts[index]; }); });
  if (limitation) throw new Error(limitation.reason);
  return request;
} });`;
      type = 'application/javascript';
      break;
    default:
      body =
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Beauty API — Swagger</title><link rel="stylesheet" href="/swagger/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/swagger/swagger-ui-bundle.js"></script><script src="/swagger/init.js"></script></body></html>';
      type = 'text/html';
  }
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'",
    },
  });
}
