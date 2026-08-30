import type { TransactionContext } from './transaction-context.js';
export interface UnitOfWork { execute<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T>; }
