# ADR-0015 — Autoridade, agenda e publicação privada

Status: decisões aprovadas nesta entrega; liberação remota pendente de qualificação.

## Identidade e autorização

Supabase Auth autentica por JWT assimétrico. A API valida assinatura, algoritmo,
emissor, audiência e validade; a identidade interna é a combinação issuer/subject.
D1 é a autoridade de memberships, permissões atuais, tenant ativo e vínculo
profissional. Nenhum papel é concedido por inferência do token.

Foram aprovadas customer.update, service.update e service.deactivate como
permissões separadas, sem concessão automática. Operações legadas sem catálogo
aprovado ficam negadas pelo PermissionGuard, inclusive administração de tenants,
desativação de clientes e alteração/desativação de profissionais.

RPC de usuário revalida JWT e membership no destinatário. Actor, tenant e escopo
não são aceitos como autoridade do payload. Membership profissional restringe
recursos ao profissional vinculado. Efeitos de sistema exigem evento persistido
da Outbox e payload conferido no D1 compartilhado. Manutenção de dispatchers usa
propriedade de Service Binding definida pelo Worker chamador, nunca um header.

## Discrepância normativa de reagendamento

A exclusão de RESCHEDULED nas consultas de disponibilidade contrariava a
persistência do compromisso remarcado nesse estado. O requisito atual aprovou
que RESCHEDULED ocupa o novo horário. Nenhum estado ou transição foi adicionado.
A atualização valida snapshot anterior e conflito no próprio statement D1.

## Suspensão de mídia

R2 fica ausente da configuração de produção. O adapter indisponível falha antes
de persistir anexos. Metadados históricos e REQUIRED_PHOTO_MISSING permanecem.
Novos agendamentos e configurações que exigem fotografia são bloqueados quando
a composição informa indisponibilidade. Os testes mantêm variante com R2.

## Outbox e efeitos financeiros

Operations coordena o disparo; cada domínio executa seu dispatcher. Leases têm
identificação por execução e recuperação limitada aos tipos pertencentes ao
dispatcher. Parâmetros de batch, lease e frequência exigem decisão operacional;
nenhum cron foi criado.

Cancellation/NoShow usam a decisão financeira congelada no evento. Efeitos ainda
não suportados geram reconciliação durável e auditada, em vez de confirmar uma
movimentação inexistente. Fingerprint ausente em snapshot inválido é registrado
como string vazia; isso representa ausência de evidência, não igualdade de estado.

## Web e implantação

O login aprovado é e-mail/senha Supabase. Foram autorizados GET /v1/me/tenants e
GET /v1/me/context. BFF usa Service Bindings; API continua autoridade definitiva.
Contratos de outras jornadas ainda incompatíveis ficam indisponíveis.

request.json continua sendo a solicitação versionada. O workflow seleciona o
Wrangler explícito e publica all em Billing → Clinical → Operations. Aprovação
production é obrigatória, migrations são independentes e não há staging remoto.
O Wrangler raiz foi removido para evitar publicação acidental de Operations.
