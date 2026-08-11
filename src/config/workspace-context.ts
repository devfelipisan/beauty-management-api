import { getSqlClient } from "@/config/dependencies";
import { readRuntimePerformanceConfig } from "@/config/performance-config";
import { WorkspaceContextResolver } from "@/modules/workspace/application/workspace-context";
import { PostgresWorkspaceContextRepository } from "@/modules/workspace/infrastructure/postgres-workspace-context.repository";

let workspaceContextResolverSingleton: WorkspaceContextResolver | null = null;

export function getWorkspaceContextResolver(): WorkspaceContextResolver {
  if (workspaceContextResolverSingleton) return workspaceContextResolverSingleton;
  const performance = readRuntimePerformanceConfig();
  workspaceContextResolverSingleton = new WorkspaceContextResolver(
    new PostgresWorkspaceContextRepository(
      getSqlClient(),
      performance.postgresSlowQueryMs,
    ),
  );
  return workspaceContextResolverSingleton;
}
