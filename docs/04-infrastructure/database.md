# Database Architecture

Application e Domain são database-agnostic. `Repository Port` é implementado por `D1Repository`; um `PostgresRepository` pode existir futuramente. `D1Database.prepare`, `bind` e `batch` só aparecem em adapters.

