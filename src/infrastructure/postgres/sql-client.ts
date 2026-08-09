export interface SqlQueryResult<TRow = Record<string, unknown>> {
  rows: TRow[];
  rowCount: number;
}

export interface SqlExecutor {
  query<TRow = Record<string, unknown>>(
    text: string,
    parameters?: readonly unknown[],
  ): Promise<SqlQueryResult<TRow>>;
}

export interface SqlClient extends SqlExecutor {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

/**
 * Driver-neutral PostgreSQL boundary owned by beauty-management-api.
 *
 * Application/domain code must continue depending only on UnitOfWork and repository
 * ports. The concrete Cloudflare/Supabase/PostgreSQL transport adapts to this interface.
 */
export interface SqlClientFactory {
  create(connectionString: string): SqlClient;
}

export class PostgreSqlDriverNotConfiguredError extends Error {
  constructor() {
    super("PostgreSQL persistence is selected, but no SqlClientFactory was configured in the Business API composition root.");
    this.name = "PostgreSqlDriverNotConfiguredError";
  }
}
