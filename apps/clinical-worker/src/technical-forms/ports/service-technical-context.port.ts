import type { GetServiceTechnicalContextRequest, GetServiceTechnicalContextResponse } from '../../../../../libs/contracts/src/index.js';
export interface ServiceTechnicalContextPort { getServiceTechnicalContext(input:GetServiceTechnicalContextRequest):Promise<GetServiceTechnicalContextResponse>; }
