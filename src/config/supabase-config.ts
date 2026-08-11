export interface SupabaseDatabaseConfig {
  region?: string;
  projectId: string;
  databaseName: string;
  databasePassword: string;
  apiKey?: string;
  supabaseUrl: string;
  runtimeConnectionString: string;
  migrationConnectionString: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
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

function normalizeConnectionString(value: string): string {
  const trimmed = value.trim();
  if (!/^postgres(?:ql)?:\/\//i.test(trimmed)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  }
  return trimmed;
}

/** PostgreSQL configuration is independent from whether user authentication is enabled. */
export function readSupabaseDatabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseDatabaseConfig {
  const projectId = required(env, "SPIdBD");
  const databaseName = required(env, "SBNameDB");
  const databasePassword = required(env, "SPPasswordDB");
  const apiKey = optional(env, "ApiKeySupaBase");
  const region = optional(env, "SPRegionDB");
  const explicitRuntimeUrl = optional(env, "DATABASE_URL");
  const explicitPoolerHost = optional(env, "SBDatabaseHost");

  let runtimeConnectionString: string;
  if (explicitRuntimeUrl) {
    runtimeConnectionString = normalizeConnectionString(explicitRuntimeUrl);
  } else {
    const host = explicitPoolerHost ?? (region ? `aws-${region}.pooler.supabase.com` : undefined);
    if (!host) {
      throw new Error("Configure DATABASE_URL or SBDatabaseHost. SPRegionDB is accepted only as a legacy pooler-host fallback.");
    }
    runtimeConnectionString = connectionString({
      host,
      port: Number(optional(env, "SBDatabasePort") ?? "6543"),
      database: databaseName,
      user: optional(env, "SBDatabaseUser") ?? `postgres.${projectId}`,
      password: databasePassword,
    });
  }

  return {
    region,
    projectId,
    databaseName,
    databasePassword,
    apiKey,
    supabaseUrl: `https://${projectId}.supabase.co`,
    runtimeConnectionString,
    migrationConnectionString: connectionString({
      host: optional(env, "SBMigrationHost") ?? `db.${projectId}.supabase.co`,
      port: Number(optional(env, "SBMigrationPort") ?? "5432"),
      database: databaseName,
      user: optional(env, "SBMigrationUser") ?? "postgres",
      password: databasePassword,
    }),
  };
}
