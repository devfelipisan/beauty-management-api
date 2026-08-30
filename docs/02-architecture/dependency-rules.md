# Dependency Rules

Domain depende apenas de tipos e políticas próprias. Application depende de Domain e Ports. Adapters implementam Ports. Controllers dependem de Application. BFF depende de contratos HTTP e chamadas de Workers, nunca de Domain, Application ou banco. Infraestrutura não pode vazar para camadas internas.

