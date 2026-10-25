import type { GetSessionStartContextRequest, SessionStartContextResponse } from '@beauty/contracts';
export interface SessionStartContextPort { getSessionStartContext(input:GetSessionStartContextRequest):Promise<SessionStartContextResponse>; }
