import { DynamicModule, Module } from '@nestjs/common';
import { D1TransactionManager } from './d1/d1-transaction-manager.js';
import { createD1DatabaseProvider } from './d1/d1-database.provider.js';
import type { D1DatabaseLike } from './d1/d1.types.js';
import { D1_DATABASE, TRANSACTION_MANAGER } from './tokens.js';

@Module({})
export class DatabaseModule {
  static forRoot(database: D1DatabaseLike): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        createD1DatabaseProvider(database),
        D1TransactionManager,
        { provide: TRANSACTION_MANAGER, useExisting: D1TransactionManager },
      ],
      exports: [D1_DATABASE, TRANSACTION_MANAGER],
    };
  }
}
