import { ConfigService } from '@nestjs/config';
import { CorrelationIdMiddleware } from './correlation-id.middleware.js';

describe('CorrelationIdMiddleware', () => {
  it('uses request id when no correlation id was provided', () => {
    const request = {
      header: (name: string) => name === 'x-request-id' ? 'request-1' : undefined,
      headers: {},
      requestId: 'request-1',
    } as never;
    const headers = new Map<string, string>();
    const response = { setHeader: (key: string, value: string) => headers.set(key, value) } as never;

    new CorrelationIdMiddleware(new ConfigService({ SERVICE_ID: 'service' }))
      .use(request, response, () => undefined);

    expect((request as { correlationId: string }).correlationId).toBe('request-1');
    expect(headers.get('x-correlation-id')).toBe('request-1');
    expect((request as { executionContext: { source: string } }).executionContext.source).toBe('web');
  });
});
