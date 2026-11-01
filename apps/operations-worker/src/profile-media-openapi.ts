import {
  envelope,
  header,
  integer,
  object,
  operation,
  query,
  text,
} from '@beauty/cloudflare-runtime/openapi';
const path = '/tenants/{tenantId}/profile-images/customer/{ownerId}';
const metadata = object({
  id: text(),
  ownerType: text({ enum: ['customer'] }),
  ownerId: text(),
  imageRole: text({ enum: ['PROFILE'] }),
  contentType: text({ enum: ['image/jpeg', 'image/png', 'image/webp'] }),
  sizeBytes: integer(),
  version: integer({ minimum: 1 }),
  updatedAt: text({ format: 'date-time' }),
});
const mutation = {
  idempotent: true,
  parameters: [
    header(
      'If-Match',
      'Versão esperada entre aspas; "0" no primeiro upload.',
      true,
    ),
  ],
};
const put = operation(
  path,
  'uploadCustomerProfileImage',
  'Substituir imagem privada do cliente',
  'customer.update',
  { ...mutation, response: envelope(metadata) },
);
put.requestBody = {
  required: true,
  content: Object.fromEntries(
    ['image/jpeg', 'image/png', 'image/webp'].map((type) => [
      type,
      {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'Imagem otimizada de até 300.000 bytes.',
        },
      },
    ]),
  ),
};
const get = operation(
  path,
  'getCustomerProfileImage',
  'Ler imagem privada do cliente',
  'customer.read',
  { parameters: [query('version', integer({ minimum: 1 }))] },
);
(get.responses as Record<string, unknown>)['200'] = {
  description: 'Imagem privada; cache privado com revalidação.',
  content: Object.fromEntries(
    ['image/jpeg', 'image/png', 'image/webp'].map((type) => [
      type,
      { schema: { type: 'string', format: 'binary' } },
    ]),
  ),
};
export const profileMediaPaths = {
  [path]: {
    put,
    get,
    delete: operation(
      path,
      'removeCustomerProfileImage',
      'Remover imagem privada do cliente',
      'customer.update',
      {
        ...mutation,
        response: envelope(
          object({ version: integer(), image: { nullable: true } }, [
            'version',
            'image',
          ]),
        ),
      },
    ),
  },
};
