import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE } from '../tokens.js';
import type { DatabaseSession } from '../ports/database-session.js';
import type { TransactionManager } from '../ports/transaction-manager.js';
import type { D1DatabaseLike } from './d1.types.js';

@Injectable()
export class D1TransactionManager implements TransactionManager {
  constructor(@Inject(D1_DATABASE) private readonly database: D1DatabaseLike) {}

  async execute<T>(callback: (session: DatabaseSession) => Promise<T>): Promise<T> {
    const session: DatabaseSession = {
      prepare: (query) => this.database.prepare(query),
    };
    try {
      return await callback(session);
    } catch (error) {
      throw new Error('DATABASE_TRANSACTION_FAILED', { cause: error });
    }
  }
}
