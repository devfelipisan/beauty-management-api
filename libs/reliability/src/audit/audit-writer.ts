import type { AuditEvent } from './audit-event.js';
export interface AuditWriter { append(event: AuditEvent): Promise<void>; }
