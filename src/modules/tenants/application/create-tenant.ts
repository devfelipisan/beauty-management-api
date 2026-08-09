import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ConflictError, createEntityId, nowIso } from "@/shared/domain/core";
import type { Tenant } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface CreateTenantInput {
  legalName: string;
  displayName: string;
  document: string;
  timezone?: string;
}

export class CreateTenantUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(context: ExecutionContext, input: CreateTenantInput): Promise<Tenant> {
    return this.unitOfWork.execute(context, async (transaction) => {
      const document = input.document.replace(/\D/g, "");
      if (!document) throw new Error("Tenant document is required.");
      const duplicate = await transaction.tenants.findByDocument(document);
      if (duplicate) throw new ConflictError("TENANT_DOCUMENT_DUPLICATE", "A tenant with this document already exists.");

      const tenant: Tenant = {
        id: createEntityId(),
        legalName: input.legalName.trim(),
        displayName: input.displayName.trim(),
        document,
        timezone: input.timezone ?? "America/Sao_Paulo",
        status: "trial",
        createdAt: nowIso(),
      };
      await transaction.tenants.create(tenant);
      await transaction.audit.append(createAuditEvent(context, {
        tenantId: tenant.id,
        action: AuditActions.TenantCreated,
        resource: { type: "tenant", id: tenant.id },
        metadata: { status: tenant.status },
      }));
      await transaction.outbox.append(createOutboxEvent({
        tenantId: tenant.id,
        type: "tenant.created",
        aggregateType: "tenant",
        aggregateId: tenant.id,
        correlationId: context.correlationId,
        payload: { tenantId: tenant.id },
      }));
      return tenant;
    });
  }
}
