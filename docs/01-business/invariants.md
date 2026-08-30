# Domain Invariants

- `INV-GER-001`: Tenant A nunca acessa recurso do Tenant B.
- `INV-GER-002`: registro financeiro confirmado não é apagado fisicamente.
- `INV-GER-003`: snapshot histórico não é recalculado por alteração futura.
- `INV-AGE-001`: profissional não possui appointments sobrepostos.
- `INV-AGE-002`: appointment concluído não pode ser cancelado.
- `INV-SIN-001`: deposit não excede o preço final.
- `INV-SES-001`: sessão não conclui sem campos técnicos obrigatórios.
- `INV-PAG-001`: refund cria movimento inverso e preserva o original.

