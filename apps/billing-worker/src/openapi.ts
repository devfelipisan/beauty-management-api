import {
  document,
  envelope,
  integer,
  object,
  operation,
  text,
} from '@beauty/cloudflare-runtime/openapi';

const payments = '/tenants/{tenantId}/receivables/{receivableId}/payments';

export const billingOpenApi = document('Beauty — Billing Worker', {
  [payments]: {
    post: operation(
      payments,
      'registerPayment',
      'Registrar pagamento de um recebível',
      'payment.create',
      {
        idempotent: true,
        status: 201,
        body: object(
          {
            customerId: text(),
            amountCents: integer({ minimum: 1 }),
            method: text({
              enum: [
                'CASH',
                'PIX',
                'DEBIT_CARD',
                'CREDIT_CARD',
                'TRANSFER',
                'INTERNAL_CREDIT',
              ],
            }),
            externalReference: text(),
            notes: text(),
          },
          ['amountCents', 'method'],
        ),
        response: envelope(
          object(
            {
              paymentId: text(),
              receivableId: text(),
              amountCents: integer(),
              paidAmountCents: integer(),
              outstandingAmountCents: integer(),
              status: text({ enum: ['OPEN', 'PARTIALLY_PAID', 'PAID'] }),
            },
            [
              'paymentId',
              'receivableId',
              'amountCents',
              'paidAmountCents',
              'outstandingAmountCents',
              'status',
            ],
          ),
        ),
        description:
          'O recebível deve existir. Refunds, créditos, sinais, pacotes e liquidação possuem operações RPC internas, sem endpoints HTTP neste Worker.',
      },
    ),
  },
});
