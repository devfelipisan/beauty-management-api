import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function optional(name) { return process.env[name]?.trim() || undefined; }
function encode(value) { return encodeURIComponent(value); }

function validateUrl(value, name) {
  if (!/^postgres(?:ql)?:\/\//i.test(value)) throw new Error(`${name} must be a PostgreSQL connection string.`);
  return value;
}

function connectionString(mode = "migration") {
  const projectId = required("SPIdBD");
  const database = required("SBNameDB");
  const password = required("SPPasswordDB");

  if (mode === "runtime") {
    const explicit = optional("DATABASE_URL");
    if (explicit) return validateUrl(explicit, "DATABASE_URL");
    const host = optional("SBDatabaseHost") ?? (optional("SPRegionDB") ? `aws-${optional("SPRegionDB")}.pooler.supabase.com` : undefined);
    if (!host) throw new Error("Configure DATABASE_URL or SBDatabaseHost for runtime/pooler database access.");
    const port = optional("SBDatabasePort") ?? "6543";
    const user = optional("SBDatabaseUser") ?? `postgres.${projectId}`;
    return `postgresql://${encode(user)}:${encode(password)}@${host}:${port}/${encode(database)}?sslmode=require`;
  }

  const explicit = optional("MIGRATION_DATABASE_URL");
  if (explicit) return validateUrl(explicit, "MIGRATION_DATABASE_URL");
  const host = optional("SBMigrationHost") ?? `db.${projectId}.supabase.co`;
  const port = optional("SBMigrationPort") ?? "5432";
  const user = optional("SBMigrationUser") ?? "postgres";
  return `postgresql://${encode(user)}:${encode(password)}@${host}:${port}/${encode(database)}?sslmode=require`;
}

async function sqlFiles(directory) {
  return (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
}

async function migrate(sql) {
  const directory = resolve("database/migrations");
  await sql.unsafe(`create table if not exists public.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`);

  const appliedRows = await sql`select filename from public.schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.filename));

  for (const filename of await sqlFiles(directory)) {
    if (applied.has(filename)) continue;
    const contents = await readFile(resolve(directory, filename), "utf8");
    console.log(`[migration] ${filename}`);
    await sql.unsafe(contents);
    await sql`insert into public.schema_migrations (filename) values (${filename}) on conflict do nothing`;
  }
}

async function seed(sql) {
  const directory = resolve("database/seeds");
  for (const filename of await sqlFiles(directory)) {
    const contents = await readFile(resolve(directory, filename), "utf8");
    console.log(`[seed] ${filename}`);
    await sql.unsafe(contents);
  }
}

async function validateSeed(sql) {
  const file = resolve("database/tests/demo_seed_smoke.sql");
  console.log("[seed-check] demo_seed_smoke.sql");
  await sql.unsafe(await readFile(file, "utf8"));
}

const command = process.argv[2] ?? "migrate";
const mode = process.env.SPDatabaseConnectionMode === "runtime" ? "runtime" : "migration";
const db = postgres(connectionString(mode), { max: 1, prepare: false, connect_timeout: 15, idle_timeout: 5 });

try {
  if (command === "migrate") await migrate(db);
  else if (command === "seed") await seed(db);
  else if (command === "setup") { await migrate(db); await seed(db); await validateSeed(db); }
  else if (command === "seed-check") await validateSeed(db);
  else if (command === "check") {
    const [row] = await db`select current_database() as database, current_user as user, now() as now`;
    console.log(JSON.stringify(row));
  } else throw new Error(`Unknown database command: ${command}`);
} finally {
  await db.end({ timeout: 5 });
}
