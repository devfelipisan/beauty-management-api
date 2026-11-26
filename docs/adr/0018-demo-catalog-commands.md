# ADR-0018 — Comandos demo privados com persistência

Status: implementado localmente para cadastros; publicação pendente.

## Contexto

O requisito atual solicita uma demo compartilhada sem login e com persistência real. A referência do backend é `feature/microsservices`, substituindo a branch histórica indicada na ADR-0017. A seleção identifica uma persona operacional; não identifica uma pessoa.

## Decisão

Estender a ADR-0017 com uma porta separada `executeSelectedWorkspaceCommand(Request)`, acessível somente pelo binding cujo `ctx.props.caller` é `beauty-management-web`. A porta HTTP e as autoridades RPC de usuário existentes não recebem bypass ou tokens fictícios.

Exigir opt-in independente no Operations e no Web, com escrita desabilitada por padrão. Revalidar a allowlist de tenants sintéticos, atividade de tenant/role/profissional e grants no D1 a cada comando. O receiver aceita somente operações com contrato implementado. Contextos profissionais não recebem os comandos de cadastro geral.

Auditar cadastros com actor nulo e metadata explícita de sistema/demo, função selecionada e sessão de correlação. A sessão não concede autoridade. Entidade, vínculos, auditoria e resultado idempotente participam do mesmo batch D1. Usar entidades e repositories existentes; frontend e BFF continuam sem domínio ou acesso ao banco.

O contexto de bootstrap anuncia somente capacidades implementadas e concedidas. O Web pode restringir essas capacidades pela sua flag, sem ampliá-las. Os comandos iniciais criam clientes, profissionais e serviços; não produzem cobranças, mensagens, memberships ou efeitos externos. Contatos sintéticos são legíveis apenas no opt-in operacional; leitura restrita mantém a projeção redigida anterior.

## Consequências e limites

Visitantes compartilham as alterações dos tenants demo e podem selecionar as personas disponibilizadas; não existe rastreabilidade pessoal. A UI informa isso e orienta dados fictícios. Tenants reais não podem ser incluídos na allowlist demo.

Agenda, clínico, financeiro, configurações e administração permanecem indisponíveis para escrita demo enquanto não tiverem contratos, autorização e coordenação entre Workers completos. Não ampliar `UserRpcAuthority` para aceitar claims anônimas como atalho.

Aplicar migrations incrementais antes dos receivers; publicar backend antes do Web; habilitar escrita após homologação. Rollback desabilita flags e preserva banco, auditoria e registros idempotentes. A matriz de implementação e as instruções operacionais estão em [demo-persistence.md](../demo-persistence.md).
