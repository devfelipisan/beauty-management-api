# Local Development

O projeto usa Node.js 24.22.1 LTS, definido em `.nvmrc`, e NestJS 12.2.0.
O CI lê a mesma versão do Node. No WSL com nvm:

```bash
nvm install
nvm use
npm ci
npm run dev:workers
```

Execute esses comandos na raiz do repositório. Use Node e npm instalados no
Linux; não compartilhe os binários de `node_modules` entre Windows e WSL.

Atualização validada no Ubuntu WSL com instalação limpa, lint, typecheck,
77 testes unitários/arquiteturais, 44 testes Cloudflare, quatro E2E Node,
build e dry-run dos três Workers. O harness define explicitamente `modulesRoot`
para os bundles temporários, evitando imports que escapem da raiz no Linux.

Documentar instalação, variáveis não sensíveis, execução dos Workers, D1 local, testes, lint, build e dry-run. Segredos reais nunca devem ser commitados.

Instalar na raiz com `npm ci` (no PowerShell com ExecutionPolicy restrita,
usar `npm.cmd ci`). Não instalar dependências separadamente nas aplicações.
O lockfile único é `package-lock.json`.

`npm run build` compila todos os workspaces; `npm run build:operations`
compila Operations e suas dependências. `npm run dev:workers` inicia o harness
local; `npm run workers:dry-run` empacota os três Workers sem publicar.
`npm run check` executa lint, typecheck, testes, build e dry-run.

O D1 continua compartilhado nesta etapa. Não recriar bancos nem aplicar
migrations remotas como parte da reorganização dos workspaces.

