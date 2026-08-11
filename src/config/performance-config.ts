export interface RuntimePerformanceConfig {
  postgresSlowQueryMs: number;
}

const DEFAULT_POSTGRES_SLOW_QUERY_MS = 750;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readRuntimePerformanceConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimePerformanceConfig {
  return {
    postgresSlowQueryMs: positiveInteger(
      env.POSTGRES_SLOW_QUERY_MS,
      DEFAULT_POSTGRES_SLOW_QUERY_MS,
    ),
  };
}
