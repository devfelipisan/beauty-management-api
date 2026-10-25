# Swagger nos Workers Cloudflare

Para preparar dados sintéticos locais antes dos testes manuais, execute
`npm run db:seed`. Consulte [a massa e os cenários de QA](../../database/seeds/README.md).

Após `npm ci`, execute `npm run dev:workers`. Na URL HTTP indicada pelo Wrangler,
abra `/swagger` ou `/api-docs`. A especificação está em `/openapi.json`.
Cada Worker publica sua própria documentação, com chamadas para sua própria origem.
Operations documenta 17 operações HTTP, Billing 2 e Clinical 20, incluindo health.

Caso o harness exponha apenas Operations no seu ambiente, execute Workers em
terminais separados. Estes são exemplos de portas locais explícitas:

```bash
npx wrangler dev -c apps/operations-worker/wrangler.jsonc --port 8787
npx wrangler dev -c apps/clinical-worker/wrangler.jsonc --port 8788
npx wrangler dev -c apps/billing-worker/wrangler.jsonc --port 8789
```

Nesse exemplo, abra respectivamente `http://localhost:8787/swagger`,
`http://localhost:8788/swagger` e `http://localhost:8789/swagger`.
O Swagger não cria um gateway nem faz proxy das rotas de negócio entre Workers.

## Executar testes manuais

1. Clique em **Authorize**. No provider mock local já implementado, informe
   `actor-dev-admin` sem o prefixo Bearer.
2. Informe `tenant-dev-001` no parâmetro `tenantId`. A autorização continua
   sendo validada pelos handlers; documentar uma rota não concede acesso.
3. Use IDs de recursos existentes no D1 local. A documentação não cria dados
   nem executa migrations. As fixtures das suítes automatizadas são isoladas.
4. Clique em **Try it out**, preencha os campos e execute. Em mutações que
   exigem `Idempotency-Key`, use uma chave por operação lógica; repita a mesma
   chave somente para reenviar o mesmo payload.
5. Upload de fotos usa arquivo binário diretamente no corpo, não multipart.
   O binding `MAX_CLINICAL_PHOTO_BYTES` precisa estar configurado conforme a
   infraestrutura existente; a documentação não escolhe um limite.

As chamadas executam operações reais no ambiente selecionado. A identidade e o
tenant acima são exclusivos do mock local existente, não credenciais de produção.

## Fronteiras e divergências registradas

- OpenAPI documenta HTTP do runtime Cloudflare. RPCs de refunds, créditos,
  sinais, outbox e demais métodos internos não viram endpoints públicos.
- Controllers Nest possuem um transporte diferente; iniciar `start:dev` não
  publica este Swagger. Para esta interface, use o Wrangler.
- `POST /customers` não está implementado no Worker e não aparece na especificação,
  embora existam casos de uso e controllers de criação no runtime Node.
- O handler PATCH de cliente verifica `customer.read`; isso é documentado sem
  alterar silenciosamente a permissão existente.
- O GET de equipment exige um corpo JSON com `id`. Navegadores não permitem
  esse corpo em fetch. A operação é marcada como deprecated e a interface
  informa a limitação ao tentar executar; nenhum parâmetro ou rota alternativo
  foi inventado. Corrigir esse contrato requer uma alteração explícita do transporte.
- Alguns handlers legados não restringem todos os verbos HTTP. A especificação
  apresenta os verbos de uso comprovados pelos fluxos/testes, sem normalizar o runtime.

## Assets e validação

Swagger UI é servido pelo próprio Worker, sem CDN e sem validação remota da
especificação. Tokens não são persistidos pelo Swagger entre sessões.
Os assets são gerados de `swagger-ui-dist` pelo `prepare` do npm; se instalar
com `--ignore-scripts`, execute `npm run swagger:assets` antes de iniciar ou compilar.

As suítes validam OpenAPI, cobertura dos matchers HTTP, entrega dos assets e
autenticação das 34 operações através de Workers/Service Bindings reais.
`npm run check` também executa os testes de negócio existentes e dry-run dos três Workers.

Validação desta implementação: 77 testes unitários/arquiteturais, 47 testes
Cloudflare e quatro health checks E2E Node passaram, junto com lint, typecheck,
build e dry-run dos três Workers. No navegador, Try it out executou `/health`
com resposta 200 e a consulta de clientes sem token com resposta 401.

## Cadastro de serviços

As cinco operações existentes no controller Nest de serviços também são expostas
no Worker Operations: POST/GET na coleção e GET/PATCH/DELETE no item. DELETE
desativa para INACTIVE, sem exclusão física. O tenant autenticado precisa existir no D1.

A autorização preserva o legado: `service.create` para criação e `service.read`
para as demais operações. PATCH e DELETE ainda não possuem permissões específicas
no controller original; nenhuma foi inventada.

Foi avaliada a confiabilidade das mutações: os casos de uso existentes executam
uma instrução D1 por recurso e filtram por tenant, mas não implementam
idempotência, auditoria ou outbox. O transporte reutiliza essas garantias
existentes; políticas adicionais precisam ser definidas antes de reforçar essas
escritas. Nenhuma migration foi alterada.
