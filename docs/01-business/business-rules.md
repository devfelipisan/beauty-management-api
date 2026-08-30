# Business Rules

Este é o documento funcional normativo. Regras devem possuir identificadores estáveis, como `RN-GER-*`, `RN-AGE-*`, `RN-SIN-*`, `RN-SES-*` e `RN-PAG-*`.

Princípios obrigatórios: multiempresa, isolamento por tenant, rastreabilidade, histórico congelado, idempotência, sinal independente de presença, desconto congelado, autorização explícita e preservação de movimentos financeiros.

Cada regra deve ser coberta por código e teste, por exemplo `Covers RN-AGE-003`.

