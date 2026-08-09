import type { ExecutionContext } from "@/shared/application/execution-context";
import type { TransactionContext, UnitOfWork } from "@/shared/application/ports";
import { ConflictError, createEntityId, nowIso } from "@/shared/domain/core";
import { stableRequestHash } from "@/shared/idempotency/idempotency";

export async function executeIdempotent<TInput, TOutput>(params: {
  unitOfWork: UnitOfWork;
  context: ExecutionContext;
  operation: string;
  key: string;
  input: TInput;
  handler: (transaction: TransactionContext) => Promise<TOutput>;
}): Promise<TOutput> {
  const tenantId = params.context.tenantId;
  if (!tenantId) throw new Error(`Tenant is required for ${params.operation}.`);
  const requestHash = stableRequestHash(params.input);

  return params.unitOfWork.execute(params.context, async (transaction) => {
    const existing = await transaction.idempotency.find(tenantId, params.operation, params.key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("IDEMPOTENCY_PAYLOAD_MISMATCH", "The same idempotency key was used with a different payload.");
      }
      if (existing.status === "completed") return existing.response as TOutput;
      if (existing.status === "processing") {
        throw new ConflictError("IDEMPOTENCY_IN_PROGRESS", "This operation is already being processed.");
      }
    }

    if (!existing) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await transaction.idempotency.reserve({
        id: createEntityId(),
        tenantId,
        key: params.key,
        operation: params.operation,
        requestHash,
        status: "processing",
        expiresAt,
      });
    }

    try {
      const output = await params.handler(transaction);
      await transaction.idempotency.complete(tenantId, params.operation, params.key, output);
      return output;
    } catch (error) {
      await transaction.idempotency.fail(tenantId, params.operation, params.key);
      throw error;
    }
  });
}

export const commandTimestamp = nowIso;
