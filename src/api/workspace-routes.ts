import type { Hono } from "hono";
import { isAuthenticationEnabled } from "@/api/request-security";
import { getWorkspaceContextResolver } from "@/config/workspace-context";
import { DomainError } from "@/shared/domain/core";

function assertPreAuthMode(): void {
  if (isAuthenticationEnabled()) {
    throw new DomainError(
      "BOOTSTRAP_WORKSPACE_DISABLED",
      "The bootstrap workspace catalog is available only while authentication is disabled.",
    );
  }
}

export function registerWorkspaceRoutes(app: Hono) {
  app.get("/v1/bootstrap/workspace", async (c) => {
    assertPreAuthMode();
    return c.json(await getWorkspaceContextResolver().listCatalog());
  });

  app.post("/v1/bootstrap/context", async (c) => {
    assertPreAuthMode();
    const input = await c.req.json<{
      tenantId?: string;
      role?: string;
      professionalId?: string;
    }>();
    return c.json(await getWorkspaceContextResolver().resolve(input));
  });
}
