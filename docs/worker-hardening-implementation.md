# Implementação do plano de segurança e consistência

Base revisada: c2f676a. Decisões: [ADR-0015](adr/0015-worker-authority-and-release-safety.md).
Operação e pendências: [runbook](worker-release-runbook.md).

Implementados: JWT/JWKS e memberships D1 sem fallback remoto; autoridade HTTP/RPC
e escopo profissional; permissões aprovadas sem grants; contratos autenticados
de contexto; validação de entradas; erro público genérico; UoW com efeitos sem
mutação de domínio; auditoria transacional de clientes/serviços; reagendamento
atômico com ocupação RESCHEDULED e replay; Outbox com ownership e fencing;
reconciliação durável de efeitos financeiros indisponíveis; Clinical sem R2;
Wranglers privados explícitos; deploy versionado sequencial e migrations separadas.

O Web irmão recebeu integração de sessão Supabase por e-mail/senha, transporte
por Service Bindings e bloqueio de capacidades incompatíveis. Seus documentos
locais anteriores foram preservados. Não foi efetuado deploy, migration remota,
provisionamento de administrador, commit ou push.

O plano ainda não está integralmente qualificado para liberação: faltam dados
reais de configuração, inventário remoto, jornadas visuais completas, smoke remoto,
ensaio de rollback e decisões operacionais de Outbox. Efeitos financeiros não
implementados ficam explícitos em reconciliação, sem simular sucesso.

## Evidências locais — 31/10/2026

Node 24.22.1, dependências restauradas pelo lockfile. API: lint e typecheck
aprovados; 48 arquivos/96 testes unitários e arquiteturais; 25 arquivos/65 testes
físicos de Workers. Após acrescentar concorrência criação versus reagendamento,
a suíte pertinente passou com 6 testes (total lógico de Workers: 66).

O gate inicial revelou ausência de AuthenticationModule no módulo Nest de tenants
após acrescentar guards. Corrigido o import, build e os 4 E2E passaram em nova
execução. Os três bundles passaram em dry-run; os 3 testes dos scripts de
configuração passaram. Nenhum teste remoto foi executado.

Web: check completo aprovado, incluindo lint sem erros, typecheck, 25 testes e
build Next. Permanecem 10 avisos de lint, avisos experimentais de Node e mensagens
de cancelamento/hung no runtime físico dos Workers apesar das suítes aprovadas.
Essas mensagens não comprovam falha de produção, mas impedem chamar a execução
de silenciosa. git diff --check foi usado para conferir whitespace; os artefatos
de execução ficam no diretório ignorado .cache.
