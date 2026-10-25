export type AssessmentResult = 'APTO' | 'APTO_COM_RESTRICOES' | 'NAO_APTO';
export interface AssessmentEligibilityRequest { tenantId: string; customerId: string; serviceId: string; professionalId: string; correlationId?: string; }
export interface AssessmentEligibilityResponse { eligible: boolean; result?: AssessmentResult; }
