# ADR-0015 — Autoridade, agenda e publicação privada

Status: decisões aprovadas; liberação remota condicionada à qualificação e às
aprovações documentais descritas no runbook.

## Identidade e autorização

Supabase Auth fornece JWT assimétrico. A API verifica assinatura, algoritmo,
issuer, audience e expiração e resolve a identidade interna por issuer/subject.
D1 é a autoridade de memberships atuais, tenant ativo, permissões e escopo
profissional. Nenhum papel é inferido do token.

AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL e AUTH_ALGORITHM são secrets remotos.
Wrangler declara somente seus nomes e verifica nativamente sua presença. O preflight
rejeita tipos incompatíveis nos metadados já consultados, sem listar secrets,
recuperar valores ou imprimir respostas remotas. A arquitetura não determina
URLs reais nem o algoritmo efetivamente configurado.

customer.update, service.update e service.deactivate foram aprovadas como
permissões separadas sem concessão automática. Operações legadas sem catálogo
continuam negadas, inclusive administração de tenants, desativação de clientes
e alteração/desativação de profissionais.

RPC de usuário revalida JWT e membership no receiver. Actor, tenant e escopo do
payload não constituem autoridade. Membership profissional restringe recursos
ao profissional vinculado. Efeitos de sistema exigem Outbox persistida e payload
conferido no D1. Dispatchers usam propriedade do Service Binding chamador.

## Agenda

A exclusão de RESCHEDULED nas consultas de disponibilidade contrariava a
persistência do compromisso remarcado nesse estado. O requisito aprovado mantém
RESCHEDULED ocupando o novo horário, sem adicionar estados ou transições.
A gravação revalida snapshot anterior e conflito no próprio statement D1.

## Mídia privada — decisão revisada

Operations declara PROFILE_MEDIA para novas imagens de perfil em beauty-r2.
Clinical e Billing não recebem R2. Os metadados e objetos clínicos históricos
permanecem preservados, sem migração, transferência ou exclusão automática.

Produção exige inventário aprovado, política documental, quotas explícitas e
coordenação de todos os escritores. Migrations mantêm os gates fechados por
padrão. O orçamento é 8.000.000.000 bytes, incluindo reservas e exclusões pendentes.

Fotografia clínica obrigatória exige BEFORE AVAILABLE, conforme snapshot da
sessão e fallback legado. BEFORE AVAILABLE confirmada continua válida sem
consultar o objeto. Não revalidar sessões concluídas. Captura e acesso binário
estão indisponíveis; reconciliação mantém a política vazia que nega produção.
Referências externas dependem de política específica antes de satisfazer a regra.

Perfil inicial atende somente clientes: customer.read/customer.update, sem
grants automáticos, máximo de 300.000 bytes via Text validado no Operations. A imagem anterior só é excluída
após confirmação da substituta; remoção explícita gera exclusão recuperável.
Imagem ativa não recebe prazo de descarte presumido.

## Outbox e efeitos financeiros

Operations coordena dispatchers por domínio. Leases têm identificação por
execução, fencing e recuperação limitada aos tipos do dispatcher. Foram
aprovados lote 5, lease 60 segundos e Cron */1 * * * * somente em Operations,
condicionados à qualificação dos consumidores.

Cancellation/NoShow preservam a decisão financeira congelada no evento. Efeitos
não suportados geram reconciliação durável e auditada. Fingerprint ausente em
snapshot inválido representa ausência de evidência, não igualdade de estado.

## Configuração, execução e implantação

Text pertence ao Dashboard; SERVICE_VERSION pertence ao pipeline. Wrangler
preserva Text e define bindings, secrets obrigatórios e perfil estático de build.
Mudar Text não habilita mocks no artefato de produção.

Cinco operações D1 simultâneas por invocação abrangem segurança, repositories e
UoW. JWKS pode ser reutilizado; memberships não são armazenadas em cache.
O pool PostgreSQL legado limita cinco conexões por processo sem ativar seu módulo
nos Workers. Não se trata de limite distribuído global de concorrência.

request.json permanece como solicitação versionada no SHA do push aprovado ou
selecionado por dispatch manual. Cada push aprovado na feature/microsservices chama
o release após verify, preservando aprovação production. Não esperar conclusão do
CI inteiro, pois a publicação pertence à mesma execução. PRs e main não publicam.
Recuperação manual exige execução push confiável encerrada e verify aprovado,
mesmo quando a publicação anterior falhou. Verify posterior reprovado não reutiliza
aprovação antiga. Tentativas e identidade são comprovadas pela API e registradas
na proveniência, preservando a leitura de registros manuais e baselines anteriores.
Publicação all segue Billing → Clinical → Operations, com aprovação production,
SHA fixo, preflight único, pós-check por destino e migrations independentes em
production-migrations. Baseline e versões publicadas exigem manifesto/proveniência
comprovados; all não dispensa compatibilidade intermediária.

Bootstrap é um fluxo protegido independente que cria somente Workers privados
ausentes. Readiness mantém inventário e habilitação de mídia fora do release;
os gates transacionais continuam bloqueando uploads sem aprovação. Auditoria
somente leitura usa environment próprio na main; sua frequência semanal depende
da primeira homologação manual. Sem staging remoto ou Wrangler raiz no deploy.

Detalhes e adoção: [PR-DEPLOY](../04-infrastructure/deployment-refactoring-plan.md)
e [runbook](../worker-release-runbook.md).

## Web

Login aprovado: e-mail/senha Supabase. GET /v1/me/tenants e GET /v1/me/context são
contratos autenticados aprovados. BFF usa Service Bindings e não acessa banco.
A API mantém a autoridade definitiva. A integração visual de perfil depende do
repositório frontend, ausente neste checkout.

Procedimentos e recuperação: [runbook de mídia](../04-infrastructure/media-release-runbook.md).
