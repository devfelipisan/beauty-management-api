export interface SupabaseDatabaseConfig {
  region: string;
  projectId: string;
  databaseName: string;
  databasePassword: string;
  apiKey: string;
  supabaseUrl: string;
  runtimeConnectionString: string;
  migrationConnectionString: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
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

/**
 * Supabase configuration owned by the API infrastructure layer.
 *
 * SPRegionDB: Supabase/AWS region used by the shared Supavisor pooler (for example sa-east-1).
 * SPIdBD: Supabase project reference/id (for example zkzzptgbiwsxinzmfvss).
 * SBNameDB: PostgreSQL database name (normally postgres).
 * SPPasswordDB: PostgreSQL database password. This is intentionally distinct from ApiKeySupaBase.
 * ApiKeySupaBase: Supabase API key used to validate Auth access tokens, never as a DB password.
 */
export function readSupabaseDatabaseConfig(env: NodeJS.ProcessEnv = process.env): SupabaseDatabaseConfig {
  const region = required(env, "SPRegionDB");
  const projectId = required(env, "SPIdBD");
  const databaseName = required(env, "SBNameDB");
  const databasePassword = required(env, "SPPasswordDB");
  const apiKey = required(env, "ApiKeySupaBase");

  return {
    region,
    projectId,
    databaseName,
    databasePassword,
    apiKey,
    supabaseUrl: `https://${projectId}.supabase.co`,
    // Supabase recommends transaction pooler for serverless/edge application traffic.
    runtimeConnectionString: connectionString({
      host: `aws-${region}.pooler.supabase.com`,
      port: 6543,
      database: databaseName,
      user: `postgres.${projectId}`,
      password: databasePassword,
    }),
    // Direct PostgreSQL endpoint is appropriate for migrations/native tooling.
    migrationConnectionString: connectionString({
      host: `db.${projectId}.supabase.co`,
      port: 5432,
      database: databaseName,
      user: "postgres",
      password: databasePassword,
    }),
  };
}
