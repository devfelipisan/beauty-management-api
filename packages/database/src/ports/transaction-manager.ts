import type { DatabaseSession } from './database-session.js';

export const TRANSACTION_MANAGER_PORT = Symbol('TRANSACTION_MANAGER_PORT');

export interface TransactionManager {
  execute<T>(callback: (session: DatabaseSession) => Promise<T>): Promise<T>;
}
