import type { SqlClient, SqlClientFactory, SqlExecutor, SqlQueryResult } from "./sql-client";

export type PostgresJsResult<TRow extends Record<string, unknown> = Record<string, unknown>> = TRow[] & { count?: number };

export interface PostgresJsConnection {
  unsafe<TRow extends Record<string, unknown> = Record<string, unknown>>(query: string, parameters?: readonly unknown[]): Promise<PostgresJsResult<TRow>>;
  begin<T>(work: (transaction: PostgresJsConnection) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
}

export type PostgresJsFactory = (connectionString: string, options?: Record<string, unknown>) => PostgresJsConnection;

class PostgresJsExecutor implements SqlExecutor {
  constructor(protected readonly connection: PostgresJsConnection) {}

  async query<TRow = Record<string, unknown>>(text: string, parameters: readonly unknown[] = []): Promise<SqlQueryResult<TRow>> {
    const rows = await this.connection.unsafe<Record<string, unknown>>(text, parameters);
    return {
      rows: [...rows] as unknown as TRow[],
      rowCount: typeof rows.count === "number" ? rows.count : rows.length,
    };
  }
}

export class PostgresJsSqlClient extends PostgresJsExecutor implements SqlClient {
  async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    return this.connection.begin((transaction) => work(new PostgresJsExecutor(transaction)));
  }

  async close(): Promise<void> {
    await this.connection.end({ timeout: 5 });
  }
}

export class PostgresJsSqlClientFactory implements SqlClientFactory {
  constructor(
    private readonly postgres: PostgresJsFactory,
    private readonly options: Record<string, unknown> = { max: 10, prepare: false },
  ) {}

  create(connectionString: string): SqlClient {
    return new PostgresJsSqlClient(this.postgres(connectionString, this.options));
  }
}
