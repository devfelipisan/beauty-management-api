export const SENSITIVE_OBSERVABILITY_KEYS = new Set([
  'password', 'authorization', 'cookie', 'accessToken', 'refreshToken', 'secret',
  'apiKey', 'cpf', 'email', 'phone', 'name', 'address', 'rawRequest',
  'rawResponse', 'document', 'documentContents', 'image', 'imageContents',
  'creditCard', 'paymentToken',
]);
export function isSensitiveObservabilityKey(key: string): boolean {
  return SENSITIVE_OBSERVABILITY_KEYS.has(key);
}
