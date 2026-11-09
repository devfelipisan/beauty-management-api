# Segurança do seletor demonstrativo

## Contrato e configuração

`readSelectedWorkspace` continua exclusivamente privado e somente leitura. `props.caller` deve ser `beauty-management-web`; headers/payload não substituem essa propriedade. Seleção de função nunca constitui credencial de usuário nem autoriza comandos.

Operations exige agora `SELECTOR_DEMO_TENANT_IDS`, Text server-side contendo um array JSON de 1 a 10 IDs distintos. Exemplo somente para ambiente local com o seed sintético: `["tenant-dev-001"]`. A configuração local do Wrangler e os testes físicos usam esse ID. Nenhum ID demonstrativo é habilitado automaticamente em produção.

A configuração ausente, vazia, duplicada, inválida ou excessiva retorna `503 SELECTOR_DEMO_CONFIGURATION_INVALID`. Não há fallback para todos os tenants. O catálogo filtra IDs no SQL parametrizado; a resolução nega IDs fora da allowlist antes da consulta de roles/permissões. Tenants inativos e papéis revogados continuam negados pelo D1.

A allowlist é uma declaração operacional de massa exclusivamente sintética, não uma detecção automática de PII. Antes de configurar produção, revisar todo o conteúdo do tenant e seus vínculos, nomes, serviços e profissionais. Nunca adicionar um tenant real ou misto. A criação/alteração de massa demonstrativa não faz parte deste patch; não foi executada em produção.

## Minimização

O catálogo de clientes do seletor usa uma projeção explícita sem telefone, e-mail, documento, mídia, notas ou campos futuros. A agenda mantém referências de exibição do tenant sintético e horários, mas remove snapshots de preço, desconto, total e sinal (retorna `null`). Detalhes retornam `allowedActions: []`. Catálogos de profissionais/serviços permanecem apenas para a massa sintética permitida; seus valores de catálogo não representam recebíveis, pagamentos ou históricos financeiros reais.

As rotas autenticadas não são alteradas. O seletor continua respeitando permissões atuais, escopo profissional, cursor contextual, limites e correlação. Respostas usam `Cache-Control: no-store`, conforme o helper `json`. Não há nova migration, acesso direto do BFF ao banco, identidade fictícia, bypass de JWT, alteração de FSM, auditoria ou outbox.

## Evidência remota e limites

A investigação Web em 08/11/2026 à noite (America/Sao_Paulo) observou health `200 reachable`, mas bootstrap `403 PERMISSION_DENIED`. Isso não comprova a causa nem as versões ativas. Sem credenciais Cloudflare no ambiente, não foi possível consultar bindings, logs, versions ou migrations aplicadas. O patch não publica Workers e não substitui o diagnóstico remoto. Não mudar a checagem de caller para contornar um erro de implantação.

A jornada de comandos, Billing/Clinical, timezone no frontend e limitação de taxa continuam fora desta correção incremental e não estão declaradas como concluídas. Antes de dados reais, autenticação definitiva e integração operacional ainda exigem qualificação.

## Release e rollback

Preparar a allowlist exclusivamente sintética no Operations; confirmar o formato e a massa sem imprimir dados pessoais. Publicar primeiro o receiver compatível, depois o Web. Qualificar catálogo, contexto, leitura, tenant excluído, caller errado/ausente, mutações negadas e ausência de contatos/snapshots financeiros. Sem configuração, o fechamento em 503 é esperado.

Restaurar uma versão anterior que listava tenants reais pode reabrir exposição; em rollback, manter o seletor desabilitado até validar a política da versão restaurada. Este documento não autoriza deploy, alteração de Text nem apply de migrations.
