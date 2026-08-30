import type { Provider } from '@nestjs/common';
import { D1_DATABASE } from '../tokens.js';
import type { D1DatabaseLike } from './d1.types.js';

export function createD1DatabaseProvider(binding: D1DatabaseLike): Provider {
  if (!binding) throw new Error('D1_DATABASE binding is required');
  return { provide: D1_DATABASE, useValue: binding };
}
