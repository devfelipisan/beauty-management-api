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

export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(private readonly supabaseUrl: string, private readonly apiKey: string) {}

  async verify(accessToken: string): Promise<AuthenticatedIdentity> {
    if (!accessToken) throw new AuthenticationRequiredError();
    const response = await fetch(`${this.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: this.apiKey },
      cache: "no-store",
    });
    if (!response.ok) throw new AuthenticationRequiredError("The access token is invalid or expired.");
    const user = (await response.json()) as { id?: unknown; email?: unknown };
    if (typeof user.id !== "string" || user.id.length === 0) throw new AuthenticationRequiredError("Supabase returned an invalid user identity.");
    return { subject: user.id, email: typeof user.email === "string" ? user.email : undefined };
  }
}

export function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new AuthenticationRequiredError();
  return match[1].trim();
}
