import type { ExecutionContext } from "@/shared/application/execution-context";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogData = Record<string, unknown>;

const SENSITIVE_KEYS = new Set(["authorization", "cookie", "password", "accessToken", "refreshToken", "token", "serviceRoleKey", "signedUrl"]);

export function sanitizeLogData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeLogData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitizeLogData(item)]));
}

export interface Logger {
  debug(event: string, data?: LogData, context?: ExecutionContext): void;
  info(event: string, data?: LogData, context?: ExecutionContext): void;
  warn(event: string, data?: LogData, context?: ExecutionContext): void;
  error(event: string, data?: LogData, context?: ExecutionContext): void;
}

export class ConsoleLogger implements Logger {
  private write(level: LogLevel, event: string, data?: LogData, context?: ExecutionContext): void {
    const payload = sanitizeLogData({ level, event, timestamp: new Date().toISOString(), requestId: context?.requestId, correlationId: context?.correlationId, tenantId: context?.tenantId, actorId: context?.actorId, operation: context?.operation, ...data });
    const serialized = JSON.stringify(payload);
    if (level === "error") console.error(serialized);
    else if (level === "warn") console.warn(serialized);
    else if (level === "debug") console.debug(serialized);
    else console.info(serialized);
  }
  debug(event: string, data?: LogData, context?: ExecutionContext) { this.write("debug", event, data, context); }
  info(event: string, data?: LogData, context?: ExecutionContext) { this.write("info", event, data, context); }
  warn(event: string, data?: LogData, context?: ExecutionContext) { this.write("warn", event, data, context); }
  error(event: string, data?: LogData, context?: ExecutionContext) { this.write("error", event, data, context); }
}
