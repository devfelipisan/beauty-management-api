import type { Hono } from "hono";
import { RuntimeConfigurationError } from "@/config/supabase-config";
import { AuthenticationRequiredError } from "@/server/auth/authentication";
import { ContractValidationError } from "@/shared/contracts/runtime-schema";
import { DomainError } from "@/shared/domain/core";

function value(error: unknown, key: string): unknown {
  return error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
}

function infrastructureMetadata(error: unknown) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    code: typeof value(error, "code") === "string" ? value(error, "code") : undefined,
    constraint: typeof value(error, "constraint") === "string" ? value(error, "constraint") : undefined,
  };
}

function isDatabaseUnavailable(error: unknown): boolean {
  const code = String(value(error, "code") ?? "");
  return code.startsWith("08") || ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "57P01", "57P02", "57P03"].includes(code);
}

function isForbiddenDomainCode(code: string): boolean {
  return code.includes("FORBIDDEN")
    || code.includes("PERMISSION")
    || code.includes("MEMBERSHIP")
    || code === "TENANT_SUSPENDED"
    || code === "TENANT_CLOSED"
    || code === "PROFESSIONAL_CONTEXT_REQUIRED"
    || code === "PROFESSIONAL_CONTEXT_INVALID"
    || code === "WORKSPACE_ROLE_UNAVAILABLE";
}

function isBadRequestDomainCode(code: string): boolean {
  return code === "TENANT_SELECTION_REQUIRED"
    || code === "TENANT_SELECTION_INVALID"
    || code === "WORKSPACE_SELECTION_INVALID"
    || code === "WORKSPACE_ROLE_REQUIRED";
}

export function registerApiErrorHandler(app: Hono) {
  app.onError((error, context) => {
    const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
    context.header("x-request-id", requestId);

    if (error instanceof ContractValidationError) {
      return context.json({ error: { code: error.code, message: error.message, issues: error.issues }, requestId }, 400);
    }
    if (error instanceof AuthenticationRequiredError || (error instanceof DomainError && error.code === "AUTHENTICATION_REQUIRED")) {
      return context.json({ error: { code: "AUTHENTICATION_REQUIRED", message: error.message }, requestId }, 401);
    }
    if (error instanceof DomainError) {
      const payload = { error: { code: error.code, message: error.message, details: error.details }, requestId };
      if (error.code === "NOT_FOUND") return context.json(payload, 404);
      if (isBadRequestDomainCode(error.code)) return context.json(payload, 400);
      if (isForbiddenDomainCode(error.code)) return context.json(payload, 403);
      return context.json(payload, 409);
    }

    const metadata = infrastructureMetadata(error);
    console.error("Unhandled API infrastructure error", {
      requestId,
      operation: `${context.req.method} ${context.req.path}`,
      ...metadata,
      ...(error instanceof RuntimeConfigurationError ? { missingVariable: error.variable } : {}),
    });

    if (error instanceof RuntimeConfigurationError) {
      return context.json({
        error: {
          code: "SERVICE_NOT_READY",
          message: "Service runtime configuration is incomplete or invalid.",
        },
        requestId,
      }, 503);
    }

    if (isDatabaseUnavailable(error)) {
      return context.json({ error: { code: "DATABASE_UNAVAILABLE", message: "Database service is temporarily unavailable." }, requestId }, 503);
    }
    return context.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." }, requestId }, 500);
  });
}
