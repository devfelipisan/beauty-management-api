import { Intercurrence } from './intercurrence.js';

describe('intercurrence severity validation', () => {
  it('rejects unsupported severity despite otherwise valid clinical references', () => {
    expect(
      () =>
        new Intercurrence(
          'i',
          'tenant',
          'session',
          'customer',
          'service',
          'professional',
          'TECHNICAL',
          'UNSUPPORTED' as never,
          'description',
          'conduct',
          'occurred',
          'reported',
          'actor',
          false,
          false,
          false,
        ),
    ).toThrow('Invalid severity');
  });
});
