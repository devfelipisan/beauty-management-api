export const WORKER_IDENTITIES = {
  bff: 'beauty-bff-worker',
  operations: 'beauty-operations-worker',
  clinical: 'beauty-clinical-worker',
  billing: 'beauty-billing-worker',
  async: 'beauty-async-worker',
} as const;

export type WorkerIdentity = (typeof WORKER_IDENTITIES)[keyof typeof WORKER_IDENTITIES];
