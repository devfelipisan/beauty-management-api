import type { SessionCompletionFacts } from '../domain/session-completion-facts.js';
export type { SessionCompletionFacts } from '../domain/session-completion-facts.js';

export interface SessionCompletionReadModelPort { getFacts(tenantId:string,sessionId:string):Promise<SessionCompletionFacts|null>; }
