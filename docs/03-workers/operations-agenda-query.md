# Consulta operacional da agenda

Decisões: [ADR-0016](../adr/0016-selected-workspace-authority.md).
Especificação HTTP executável: OpenAPI do Operations Worker.

## Rotas

| Método e caminho | Permissão |
| --- | --- |
| GET /tenants/{tenantId}/agenda | agenda.read |
| GET /tenants/{tenantId}/appointments/{appointmentId} | agenda.read |
| GET /tenants/{tenantId}/professionals/{professionalId}/availability | agenda.read |

Todas exigem identidade, membership ativa, função selecionada válida e grants
atuais. Ausência de seleção exige uma única função operacional. O escopo
profissional persistido restringe listagem, detalhes e conflito. Filtros
conflitantes são rejeitados, sem substituição silenciosa.

## Listagem

from/to são instantes com fuso, normalizados em UTC; intervalo [from,to),
máximo de 42 dias. Compromissos sobrepostos são incluídos. Filtros opcionais:
professionalId, serviceId, status. limit é inteiro de 1 a 100, padrão 50.
Parâmetros desconhecidos, duplicados ou inválidos são rejeitados.

Envelope: `{ data, requestId, correlationId }`. data contém tenant
(id/displayName/timezone), period (from/to), appointments, summary e page
(nextCursor/hasMore). Cada compromisso contém id, referências mínimas
customer/professional/service (id/displayName), startsAt, endsAt, status e origin.
Nomes são atuais; não representam snapshots históricos. Referências inativas
não removem os compromissos. Não são expostos contatos, fichas ou valores.

summary conta por status usando os mesmos filtros e escopo, sem cursor/limit.
Estados sem registros não precisam aparecer. Não usar a quantidade da página
como total do período.

Ordenação ascendente por startsAt/id. Cursor opaco associado ao contexto e aos
filtros. Alterar contexto ou filtros invalida o cursor. As leituras são vivas:
página e resumo, assim como páginas sucessivas, podem observar mutações.
Não existe garantia de snapshot. Atualizar após comandos ou troca de contexto.

## Detalhes e ações

Detalhes expõem os mesmos campos mínimos e allowedActions. A primeira projeção
avalia confirm e check-in com a política de presença compartilhada pelos comandos.
FSM e permissões não bastam para anunciar ações clínicas ou comerciais; essas
ações são omitidas até avaliação completa. Todo comando revalida sua condição.
Recurso ausente ou fora do escopo profissional resulta em APPOINTMENT_NOT_FOUND.

## Conflito

A rota de availability preserva o formato `{ available, startsAt, endsAt }`,
mas verifica somente conflito com compromissos persistidos. Não considera
jornada, afastamentos ou novos bloqueios, não enumera horários e não reserva.
A escrita continua revalidando o intervalo. RESCHEDULED ocupa o novo horário.

## Desenvolvimento

O seed local cadastra identidades e grants sintéticos persistidos, sem criar
agendamentos ou movimentos financeiros. Workers usam MockIdentityProvider
somente na composição local/teste, mas continuam consultando memberships no D1.
Produção usa JWT/JWKS e não permite ativar mocks por Text ou headers.

O web encaminha o contexto por Service Binding. Seus catálogos são composições
de leituras autorizadas existentes, sem carregar o cadastro integral de clientes.
O build de desenvolvimento permite escolher os atores sintéticos por função;
essa composição não é disponibilizada pelo build de produção.
