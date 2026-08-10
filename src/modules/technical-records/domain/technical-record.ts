import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export interface TechnicalRecord {
  id: EntityId;
  tenantId: EntityId;
  sessionId: EntityId;
  region?: string;
  equipmentId?: EntityId;
  power?: number;
  powerUnit?: string;
  reaction?: string;
  notes?: string;
  createdAt: IsoDateTime;
}

export interface CreateTechnicalRecordProps {
  tenantId: EntityId;
  sessionId: EntityId;
  region?: string;
  equipmentId?: EntityId;
  power?: number;
  powerUnit?: string;
  reaction?: string;
  notes?: string;
}

const optionalTrimmed = (value?: string): string | undefined => {
  const normalized = value?.trim();
  return normalized || undefined;
};

export function createTechnicalRecord(props: CreateTechnicalRecordProps): TechnicalRecord {
  const tenantId = props.tenantId.trim();
  const sessionId = props.sessionId.trim();
  if (!tenantId || !sessionId) throw new DomainError("TECHNICAL_RECORD_REFERENCE_REQUIRED", "Tenant and session are required.");
  if (props.power !== undefined && (!Number.isFinite(props.power) || props.power < 0)) {
    throw new DomainError("TECHNICAL_RECORD_POWER_INVALID", "Power must be a non-negative finite number.");
  }
  const powerUnit = optionalTrimmed(props.powerUnit);
  if (props.power !== undefined && !powerUnit) {
    throw new DomainError("TECHNICAL_RECORD_POWER_UNIT_REQUIRED", "Power unit is required when power is informed.");
  }
  return {
    id: createEntityId(),
    tenantId,
    sessionId,
    region: optionalTrimmed(props.region),
    equipmentId: optionalTrimmed(props.equipmentId),
    power: props.power,
    powerUnit,
    reaction: optionalTrimmed(props.reaction),
    notes: optionalTrimmed(props.notes),
    createdAt: nowIso(),
  };
}
