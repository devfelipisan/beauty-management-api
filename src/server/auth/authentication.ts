import { DomainError } from "@/shared/domain/core";

export interface AuthenticatedIdentity {
  subject: string;
  email?: string;
}

export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthenticatedIdentity>;
}

export class AuthenticationRequiredError extends DomainError {
  constructor(message = "Authentication is required.") {
    super("AUTHENTICATION_REQUIRED", message);
    this.name = "AuthenticationRequiredError";
  }
}

/**
 * Temporary tokenless verifier used while authentication is intentionally
 * disabled for implementation and integration testing. Authorization remains
 * server-side and is still evaluated against the configured subject.
 */
export class DisabledAuthVerifier implements AuthVerifier {
  constructor(private readonly subject = "user-tenant-admin") {}

  async verify(): Promise<AuthenticatedIdentity> {
    return { subject: this.subject };
  }
}

export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(private readonly supabaseUrl: string, private readonly anonKey: string) {}

  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    if (!accessToken) throw new AuthenticationRequiredError();
    const response = await fetch(`${this.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: this.anonKey },
      cache: "no-store",
    });
    if (!response.ok) throw new AuthenticationRequiredError("The access token is invalid or expired.");
    const user = (await response.json()) as { id?: unknown; email?: unknown };
    if (typeof user.id !== "string" || user.id.length === 0) throw new AuthenticationRequiredError("Supabase returned an invalid user identity.");
    return { subject: user.id, email: typeof user.email === "string" ? user.email : undefined };
  }
}

/** Development/test verifier. The supplied token is treated as the local user id. */
export class MockAuthVerifier implements AuthVerifier {
  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    const subject = accessToken.startsWith("mock:") ? accessToken.slice(5) : accessToken;
    if (!subject) throw new AuthenticationRequiredError("A mock identity token is required.");
    return { subject };
  }
}

export type ApiAuthMode = "disabled" | "mock" | "supabase";

export function resolveApiAuthMode(value?: string): ApiAuthMode {
  // `development` is kept as a backwards-compatible alias so existing Worker
  // environments do not fail during the transition to the explicit name.
  if (!value || value === "disabled" || value === "development") return "disabled";
  if (value === "mock") return "mock";
  if (value === "supabase") return "supabase";
  throw new Error(`Unsupported API_AUTH_MODE: ${value}`);
}

export function createAuthVerifier(input: {
  mode?: ApiAuthMode;
  supabaseUrl?: string;
  anonKey?: string;
  disabledSubject?: string;
} = {}): AuthVerifier {
  const mode = input.mode ?? "disabled";
  if (mode === "disabled") return new DisabledAuthVerifier(input.disabledSubject);
  if (mode === "mock") return new MockAuthVerifier();
  if (!input.supabaseUrl || !input.anonKey) throw new Error("Supabase URL and anonymous key are required for supabase authentication mode.");
  return new SupabaseAuthVerifier(input.supabaseUrl, input.anonKey);
}

export function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new AuthenticationRequiredError();
  return match[1].trim();
}
