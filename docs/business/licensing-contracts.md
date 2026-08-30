# Licensing e admissão

`License` é tenant-owned e é lida pelo Operations Worker. Os únicos estados canônicos são `CONFIGURING`, `TRIAL`, `ACTIVE`, `PAYMENT_PENDING`, `GRACE`, `SUSPENDED` e `CANCELED`.

`ACTIVE` e `TRIAL` são operacionais; `CONFIGURING`, `SUSPENDED` e `CANCELED` bloqueiam novos appointments. `PAYMENT_PENDING` e `GRACE` só operam quando `tolerance_until` está configurado e ainda válido. Nenhuma duração de tolerância é inferida.

O plano SaaS do tenant não é o Cloudflare Free Tier. A admissão consulta a capability técnica `APPOINTMENT_ADMISSION` armazenada no snapshot da licença. Não há nomes comerciais nem quotas numéricas inventadas. A quota mensal de atendimentos não é consumida na criação de Appointment neste PR.

Consultas de licença e restrição não geram auditoria; comandos administrativos futuros deverão auditar alterações de status.
