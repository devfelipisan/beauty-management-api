import type { GetServiceTechnicalContextRequest, GetServiceTechnicalContextResponse } from '@beauty/contracts';
export interface ServiceTechnicalContextPort { getServiceTechnicalContext(input:GetServiceTechnicalContextRequest):Promise<GetServiceTechnicalContextResponse>; }
