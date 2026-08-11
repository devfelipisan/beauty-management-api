export interface AuthenticationPolicy {
  enabled: boolean;
}

function booleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error("AUTHENTICATION_ENABLED must be true or false.");
}

/**
 * Authentication is intentionally disabled by default while login/session UX is
 * not part of the active MVP stage. This gate must not disable tenant isolation:
 * tenant context is still resolved from PostgreSQL for every tenant-scoped route.
 */
export function readAuthenticationPolicy(env: NodeJS.ProcessEnv = process.env): AuthenticationPolicy {
  return { enabled: booleanEnv(env.AUTHENTICATION_ENABLED, false) };
}
