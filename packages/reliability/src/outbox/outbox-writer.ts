import type { OutboxEvent } from './outbox-event.js';
export interface OutboxWriter { append(event: OutboxEvent): Promise<void>; }
