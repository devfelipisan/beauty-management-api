# Cloudflare Free Budget

Limites de referência: Workers 100k requests/dia; Pages 500 builds/mês; D1 5 GB, 5M reads/dia e 100k writes/dia; KV 1 GB, 100k reads/dia e 1k writes/dia; R2 10 GB e 1M operações Class A/mês.

Metas internas: Workers, D1 reads/writes e KV reads/writes ≤ 50%; R2 ≤ 70%; Pages builds ≤ 50%. Toda feature avalia `COST-REQ`, `COST-D1-R`, `COST-D1-W`, `COST-KV-R`, `COST-KV-W` e `COST-R2`.

