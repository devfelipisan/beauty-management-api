export interface TransactionalCommand { kind: 'D1_SQL'; sql: string; params: unknown[]; }
export interface TransactionalWriteContext { add(command: TransactionalCommand): void; }
