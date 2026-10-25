const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'authorization', 'cookie', 'setcookie',
  'token', 'accesstoken', 'refreshtoken', 'cpf', 'document', 'email', 'phone',
  'medical', 'allergy', 'medication', 'technicalrecord', 'technicalnotes',
  'name', 'address', 'rawrequest', 'rawresponse', 'creditcard', 'paymenttoken',
  'photo', 'file', 'proof', 'receipt', 'signedurl', 'presignedurl',
]);

function normalizeKey(key: string): string {
  return key.replace(/[-_]/g, '').toLowerCase();
}

export class TelemetrySanitizer {
  sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key,
        SENSITIVE_KEYS.has(normalizeKey(key))
          ? '[REDACTED]'
          : this.sanitizeValue(value),
      ]),
    );
  }

  private sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitizeValue(item));
    if (value && typeof value === 'object') {
      return this.sanitize(value as Record<string, unknown>);
    }
    return value;
  }
}
