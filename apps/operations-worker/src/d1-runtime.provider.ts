import type { Provider } from '@nestjs/common';
import { D1_DATABASE } from '../../../libs/database/src/tokens.js';
import type { D1DatabaseLike } from '../../../libs/database/src/d1/d1.types.js';

// Cloudflare injects the binding at the Worker composition boundary. Local
// Nest health must remain bootable when that boundary is not present.
const unavailable: D1DatabaseLike = {
  prepare: () => ({ bind: () => unavailable.prepare(''), first: async () => { throw new Error('D1 binding is not configured'); }, all: async () => { throw new Error('D1 binding is not configured'); }, run: async () => { throw new Error('D1 binding is not configured'); } }),
  batch: async () => { throw new Error('D1 binding is not configured'); },
};
export const D1RuntimeProvider: Provider = { provide: D1_DATABASE, useFactory: () => (globalThis as { D1_DATABASE?: D1DatabaseLike }).D1_DATABASE ?? unavailable };
