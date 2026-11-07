import {
  boolean,
  object,
  text,
  type Schema,
} from '@beauty/cloudflare-runtime/openapi';
export function catalogEnvelope(data: Schema): Schema {
  return object(
    {
      data,
      page: object({ hasMore: boolean, nextCursor: text({ nullable: true }) }, [
        'hasMore',
        'nextCursor',
      ]),
      requestId: text(),
      correlationId: text(),
    },
    ['data', 'page', 'requestId', 'correlationId'],
  );
}
