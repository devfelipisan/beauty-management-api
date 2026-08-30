# Billing — Commercial Terms

Billing é a autoridade para Commercial Terms, Discount e Deposit. Operations
fornece o preço-base e contexto comercial compacto; Billing não consulta as
tabelas de Customer, Service ou Appointment de Operations.

## Commercial Terms

O contrato usa somente centavos inteiros:

- `basePriceCents >= 0`;
- `discountCents >= 0` e `discountCents <= basePriceCents`;
- `finalPriceCents = basePriceCents - discountCents`;
- `depositCents >= 0` e `depositCents <= finalPriceCents`.

## Policies

As policies de desconto e sinal ainda não possuem configuração normativa neste
repositório. Enquanto não houver autoridade real, o resultado é `BLOCKED`.
Nenhum percentual, faixa, aprovação automática ou valor padrão é inventado.

Não há Payment, Refund, Package, Credit, consumer de outbox ou persistência de
Deposit nesta etapa.
