import type { ExecutionContext } from "@/shared/application/execution-context";
import type { TransactionContext, UnitOfWork } from "@/shared/application/ports";
import type { Logger } from "@/shared/logging/logger";

export class LoggingUnitOfWork implements UnitOfWork {
  constructor(private readonly delegate: UnitOfWork, private readonly logger: Logger) {}
  async execute<T>(context: ExecutionContext, work: (transaction: TransactionContext) => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    this.logger.debug("transaction.started", undefined, context);
    try {
      const result = await this.delegate.execute(context, work);
      this.logger.info("transaction.committed", { durationMs: Math.round(performance.now() - startedAt) }, context);
      return result;
    } catch (error) {
      this.logger.error("transaction.rolled_back", {
        durationMs: Math.round(performance.now() - startedAt),
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown failure",
      }, context);
      throw error;
    }
  }
}
