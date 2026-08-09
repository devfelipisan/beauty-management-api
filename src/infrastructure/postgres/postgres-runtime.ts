import { PostgresAccessControlRepository } from "./postgres-access-control.repository";
import { PostgresLeadRepository } from "./postgres-lead.repository";
import { PostgresUnitOfWork } from "./postgres-unit-of-work";
import type { SqlClient } from "./sql-client";

/**
 * Infrastructure-only composition for PostgreSQL persistence.
 * Application and domain layers consume ports and never depend on this runtime.
 */
export function createPostgresRuntime(sqlClient: SqlClient) {
  return {
    unitOfWork: new PostgresUnitOfWork(sqlClient),
    leadRepository: new PostgresLeadRepository(sqlClient),
    accessControl: new PostgresAccessControlRepository(sqlClient),
  };
}
