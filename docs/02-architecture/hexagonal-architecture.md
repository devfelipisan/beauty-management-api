# Hexagonal Architecture

Casos de uso entram por adapters de entrada e acessam persistência, filas, relógio e armazenamento por ports. O domínio permanece TypeScript puro e testável; detalhes NestJS e Cloudflare ficam na composição e nos adapters.

