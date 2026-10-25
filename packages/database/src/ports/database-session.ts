export interface DatabasePreparedStatement {
  bind(...values: unknown[]): DatabasePreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: Record<string, unknown> }>;
}

export interface DatabaseSession {
  prepare(query: string): DatabasePreparedStatement;
}
