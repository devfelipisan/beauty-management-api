import { getSqlClient } from "@/config/dependencies";
import { WorkspaceContextResolver } from "@/modules/workspace/application/workspace-context";
import { PostgresWorkspaceContextRepository } from "@/modules/workspace/infrastructure/postgres-workspace-context.repository";

let workspaceContextResolverSingleton: WorkspaceContextResolver | null = null;

export function getWorkspaceContextResolver(): WorkspaceContextResolver {
  if (workspaceContextResolverSingleton) return workspaceContextResolverSingleton;
  workspaceContextResolverSingleton = new WorkspaceContextResolver(
    new PostgresWorkspaceContextRepository(getSqlClient()),
  );
  return workspaceContextResolverSingleton;
}
