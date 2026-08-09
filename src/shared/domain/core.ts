export type EntityId = string;
export type IsoDateTime = string;
export type MoneyCents = number;

export interface Entity<TProps> {
  readonly id: EntityId;
  readonly props: TProps;
}

export type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const success = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const failure = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error });

export function createEntityId(): EntityId {
  return crypto.randomUUID();
}

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

export function assertMoneyCents(value: number, field = "value"): MoneyCents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("INVALID_MONEY", `${field} must be a non-negative integer amount in cents.`);
  }
  return value;
}

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} ${id} was not found.`, { resource, id });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ForbiddenError";
  }
}
