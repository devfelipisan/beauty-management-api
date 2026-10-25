import { TelemetrySanitizer } from './telemetry-sanitizer.js';

describe('TelemetrySanitizer', () => {
  it('redacts credentials, PII and clinical data recursively', () => {
    expect(new TelemetrySanitizer().sanitize({
      password: 'secret',
      token: 'abc',
      customerId: 'c-1',
      nested: { medical: 'private' },
    })).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      customerId: 'c-1',
      nested: { medical: '[REDACTED]' },
    });
  });
});
