import { mappedError } from './index.js';

describe('public HTTP error catalogue', () => {
  it('does not expose arbitrary infrastructure messages or reasons', async () => {
    const error = Object.assign(new Error('D1_ERROR: secret SQL payload'), {
      reasons: ['private detail'],
    });
    const response = mappedError(error, 'request', 'correlation');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal error',
      requestId: 'request',
      correlationId: 'correlation',
    });
    expect(
      ((await mappedError({ code: 123 }, 'r', 'c').json()) as { code: string })
        .code,
    ).toBe('INTERNAL_ERROR');
  });

  it.each([
    ['APPOINTMENT_TIME_CONFLICT', 409],
    ['PERMISSION_DENIED', 403],
    ['SESSION_NOT_FOUND', 404],
    ['CLINICAL_MEDIA_UNAVAILABLE', 503],
  ])('maps %s explicitly', (code, status) => {
    expect(mappedError(new Error(code), 'r', 'c').status).toBe(status);
  });
});
