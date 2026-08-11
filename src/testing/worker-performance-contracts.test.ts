import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimePerformanceConfig } from "../config/performance-config.ts";

test("PostgreSQL slow-query threshold defaults to 750 ms", () => {
  const config = readRuntimePerformanceConfig({});
  assert.equal(config.postgresSlowQueryMs, 750);
});

test("PostgreSQL slow-query threshold accepts a positive integer override", () => {
  const config = readRuntimePerformanceConfig({ POSTGRES_SLOW_QUERY_MS: "1200" });
  assert.equal(config.postgresSlowQueryMs, 1200);
});

test("invalid PostgreSQL slow-query thresholds fall back safely", () => {
  assert.equal(readRuntimePerformanceConfig({ POSTGRES_SLOW_QUERY_MS: "0" }).postgresSlowQueryMs, 750);
  assert.equal(readRuntimePerformanceConfig({ POSTGRES_SLOW_QUERY_MS: "-1" }).postgresSlowQueryMs, 750);
  assert.equal(readRuntimePerformanceConfig({ POSTGRES_SLOW_QUERY_MS: "abc" }).postgresSlowQueryMs, 750);
  assert.equal(readRuntimePerformanceConfig({ POSTGRES_SLOW_QUERY_MS: "10.5" }).postgresSlowQueryMs, 750);
});
