import type { GetSessionStartContextRequest, SessionStartContextResponse } from '../../../../../libs/contracts/src/index.js';
export interface SessionStartContextPort { getSessionStartContext(input:GetSessionStartContextRequest):Promise<SessionStartContextResponse>; }
