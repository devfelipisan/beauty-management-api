import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function encode(value) { return encodeURIComponent(value); }

function connectionString(mode = "migration") {
  const region = required("SPRegionDB");
  const projectId = required("SPIdBD");
  const database = required("SBNameDB");
  const password = required("SPPasswordDB");

  if (mode === "runtime") {
    return `postgresql://${encode(`postgres.${projectId}`)}:${encode(password)}@aws-${region}.pooler.supabase.com:6543/${encode(database)}?sslmode=require`;
  }
  return `postgresql://postgres:${encode(password)}@db.${projectId}.supabase.co:5432/${encode(database)}?sslmode=require`;
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

const command = process.argv[2] ?? "migrate";
const mode = process.env.SPDatabaseConnectionMode === "runtime" ? "runtime" : "migration";
const db = postgres(connectionString(mode), { max: 1, prepare: false, connect_timeout: 15, idle_timeout: 5 });

try {
  if (command === "migrate") await migrate(db);
  else if (command === "seed") await seed(db);
  else if (command === "setup") { await migrate(db); await seed(db); }
  else if (command === "check") {
    const [row] = await db`select current_database() as database, current_user as user, now() as now`;
    console.log(JSON.stringify(row));
  } else throw new Error(`Unknown database command: ${command}`);
} finally {
  await db.end({ timeout: 5 });
}
