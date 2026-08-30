import { ExecutionContextFactory } from './execution-context.factory.js';

describe('ExecutionContextFactory', () => {
  it('creates technical context without resolving identity fields', () => {
    expect(new ExecutionContextFactory().create({
      requestId: 'request-1',
      correlationId: 'correlation-1',
      source: 'web',
      service: 'beauty-management-api',
    })).toEqual({
      requestId: 'request-1',
      correlationId: 'correlation-1',
      source: 'web',
      service: 'beauty-management-api',
    });
  });
});
