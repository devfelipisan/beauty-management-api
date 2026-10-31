import { TelemetrySanitizer } from './telemetry-sanitizer.js';

describe('TelemetrySanitizer', () => {
  it('sanitizes nested arrays recursively while preserving safe primitives and null', () => {
    expect(
      new TelemetrySanitizer().sanitize({
        rows: [
          { access_token: 'private', count: 1 },
          null,
          false,
          ['safe', { email: 'private' }],
        ],
      }),
    ).toEqual({
      rows: [
        { access_token: '[REDACTED]', count: 1 },
        null,
        false,
        ['safe', { email: '[REDACTED]' }],
      ],
    });
  });
  it('redacts credentials, PII and clinical data recursively', () => {
    expect(
      new TelemetrySanitizer().sanitize({
        password: 'secret',
        token: 'abc',
        customerId: 'c-1',
        nested: { medical: 'private' },
      }),
    ).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      customerId: 'c-1',
      nested: { medical: '[REDACTED]' },
    });
  });
});
