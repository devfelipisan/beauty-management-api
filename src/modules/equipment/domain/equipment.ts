import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export type EquipmentStatus = "available" | "maintenance" | "blocked" | "inactive";

export interface Equipment {
  id: EntityId;
  tenantId: EntityId;
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  primaryUnit?: string;
  serviceIds: EntityId[];
  status: EquipmentStatus;
  notes?: string;
  lastUsedAt?: IsoDateTime;
  usageCount: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateEquipmentProps {
  tenantId: EntityId;
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  primaryUnit?: string;
  serviceIds?: EntityId[];
  notes?: string;
}

function optionalTrimmed(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function createEquipment(props: CreateEquipmentProps): Equipment {
  const tenantId = props.tenantId.trim();
  const name = props.name.trim();
  if (!tenantId) throw new DomainError("EQUIPMENT_TENANT_REQUIRED", "Tenant is required to create equipment.");
  if (name.length < 2) throw new DomainError("EQUIPMENT_NAME_INVALID", "Equipment name must contain at least 2 characters.");

  const timestamp = nowIso();
  return {
    id: createEntityId(),
    tenantId,
    name,
    model: optionalTrimmed(props.model),
    manufacturer: optionalTrimmed(props.manufacturer),
    serialNumber: optionalTrimmed(props.serialNumber),
    primaryUnit: optionalTrimmed(props.primaryUnit),
    serviceIds: [...new Set((props.serviceIds ?? []).map((id) => id.trim()).filter(Boolean))],
    status: "available",
    notes: optionalTrimmed(props.notes),
    usageCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
