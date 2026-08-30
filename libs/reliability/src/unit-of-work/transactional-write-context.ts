export interface TransactionalCommand { kind: 'D1_SQL'; sql: string; params: unknown[]; expectedChanges?: number; failureCode?: string; }
export interface TransactionalWriteContext { add(command: TransactionalCommand): void; }
