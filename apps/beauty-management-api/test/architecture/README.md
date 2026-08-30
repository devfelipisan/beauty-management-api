# Architecture Tests

Estas verificações devem falhar quando:

- `domain/` importar `@nestjs/*` ou Cloudflare;
- `application/` importar `D1Database`;
- BFF importar Domain/Application ou acessar banco;
- controllers importarem adapters de D1 diretamente.

Implementar a ferramenta de análise quando o código dos Workers for adicionado.

