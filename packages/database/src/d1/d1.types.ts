import type { DatabasePreparedStatement } from '../ports/database-session.js';

export interface D1DatabaseLike {
  prepare(query: string): DatabasePreparedStatement;
  batch(statements: DatabasePreparedStatement[]): Promise<unknown[]>;
}
