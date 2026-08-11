export type EnvironmentMap = Readonly<Record<string, string | undefined>>;

export class RuntimeConfigurationError extends Error {
  readonly code = "SERVICE_CONFIGURATION_INVALID";

  constructor(
    message: string,
    readonly variable?: string,
  ) {
    super(message);
    this.name = "RuntimeConfigurationError";
  }
}

export interface DatabaseRuntimeConfig {
  runtimeConnectionString: string;
  source: "database_url" | "components";
}

export interface DatabaseMigrationConfig {
  migrationConnectionString: string;
  source: "migration_database_url" | "components";
}

export interface SupabaseAuthConfig {
  projectId: string;
  apiKey: string;
  supabaseUrl: string;
}

function required(env: EnvironmentMap, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new RuntimeConfigurationError(
      `Missing required environment variable ${name}.`,
      name,
    );
  }
  return value;
}

function optional(env: EnvironmentMap, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function connectionString(input: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): string {
  const user = encodeURIComponent(input.user);
  const password = encodeURIComponent(input.password);
  const database = encodeURIComponent(input.database);
  return `postgresql://${user}:${password}@${input.host}:${input.port}/${database}?sslmode=require`;
}

function normalizeConnectionString(value: string, variable: string): string {
  const trimmed = value.trim();
  if (!/^postgres(?:ql)?:\/\//i.test(trimmed)) {
    throw new RuntimeConfigurationError(
      `${variable} must be a PostgreSQL connection string.`,
      variable,
    );
  }
  return trimmed;
}

function validPort(value: string | undefined, fallback: number, variable: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new RuntimeConfigurationError(`${variable} must be a valid TCP port.`, variable);
  }
  return parsed;
}

/**
 * Worker/server runtime configuration.
 *
 * DATABASE_URL is authoritative when present and is intentionally sufficient by itself.
 * The decomposed mode exists for environments that prefer separate bindings, but no
 * pooler hostname is inferred from region because Supabase endpoints are project-specific.
 */
export function readDatabaseRuntimeConfig(
  env: EnvironmentMap = process.env,
): DatabaseRuntimeConfig {
  const explicitRuntimeUrl = optional(env, "DATABASE_URL");
  if (explicitRuntimeUrl) {
    return {
      runtimeConnectionString: normalizeConnectionString(explicitRuntimeUrl, "DATABASE_URL"),
      source: "database_url",
    };
  }

  const host = required(env, "SBDatabaseHost");
  const database = required(env, "SBNameDB");
  const password = required(env, "SPPasswordDB");
  const projectId = optional(env, "SPIdBD");
  const configuredUser = optional(env, "SBDatabaseUser");
  const user = configuredUser ?? (projectId ? `postgres.${projectId}` : undefined);
  if (!user) {
    throw new RuntimeConfigurationError(
      "Configure SBDatabaseUser when SPIdBD is not available.",
      "SBDatabaseUser",
    );
  }

  return {
    runtimeConnectionString: connectionString({
      host,
      port: validPort(optional(env, "SBDatabasePort"), 6543, "SBDatabasePort"),
      database,
      user,
      password,
    }),
    source: "components",
  };
}

/**
 * Migration/seed tooling configuration. It is deliberately independent from the
 * Worker runtime pooler configuration so DDL can keep using the direct database
 * endpoint (or an explicit migration URL).
 */
export function readDatabaseMigrationConfig(
  env: EnvironmentMap = process.env,
): DatabaseMigrationConfig {
  const explicitMigrationUrl = optional(env, "MIGRATION_DATABASE_URL");
  if (explicitMigrationUrl) {
    return {
      migrationConnectionString: normalizeConnectionString(
        explicitMigrationUrl,
        "MIGRATION_DATABASE_URL",
      ),
      source: "migration_database_url",
    };
  }

  const projectId = required(env, "SPIdBD");
  const database = required(env, "SBNameDB");
  const password = required(env, "SPPasswordDB");

  return {
    migrationConnectionString: connectionString({
      host: optional(env, "SBMigrationHost") ?? `db.${projectId}.supabase.co`,
      port: validPort(optional(env, "SBMigrationPort"), 5432, "SBMigrationPort"),
      database,
      user: optional(env, "SBMigrationUser") ?? "postgres",
      password,
    }),
    source: "components",
  };
}

/** Supabase Auth configuration is required only when authentication is enabled. */
export function readSupabaseAuthConfig(
  env: EnvironmentMap = process.env,
): SupabaseAuthConfig {
  const projectId = required(env, "SPIdBD");
  const apiKey = required(env, "ApiKeySupaBase");
  return {
    projectId,
    apiKey,
    supabaseUrl: `https://${projectId}.supabase.co`,
  };
}
