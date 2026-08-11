export type RuntimeDataSource = "postgres" | "memory";

export interface RuntimeDataSourceConfig {
  dataSource: RuntimeDataSource;
}

export function readRuntimeDataSourceConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeDataSourceConfig {
  const value = env.API_DATA_SOURCE?.trim().toLowerCase();
  if (!value || value === "postgres") return { dataSource: "postgres" };
  if (value === "memory") return { dataSource: "memory" };
  throw new Error(`Unsupported API_DATA_SOURCE '${value}'. Expected 'postgres' or 'memory'.`);
}

export function isMemoryDataSource(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return readRuntimeDataSourceConfig(env).dataSource === "memory";
}
