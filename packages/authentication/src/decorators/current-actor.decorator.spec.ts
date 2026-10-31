import { type ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { CurrentActor } from './current-actor.decorator.js';

describe('CurrentActor transport adapter', () => {
  it('extracts the resolved request identity and ignores client-supplied body authority', () => {
    class Handler {
      handle(_actor: unknown) {}
    }
    CurrentActor()(Handler.prototype, 'handle', 0);
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      Handler,
      'handle',
    ) as Record<
      string,
      { factory: (data: unknown, context: ExecutionContext) => unknown }
    >;
    const [{ factory }] = Object.values(metadata);
    const identity = { actorId: 'verified', subject: 'subject' };
    const context = (request: object) =>
      ({
        switchToHttp: () => ({ getRequest: () => request }),
      }) as ExecutionContext;
    expect(
      factory(
        undefined,
        context({ user: identity, body: { actorId: 'forged' } }),
      ),
    ).toBe(identity);
    expect(
      factory(undefined, context({ body: { actorId: 'forged' } })),
    ).toBeUndefined();
  });
});
