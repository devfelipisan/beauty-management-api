export type AssessmentResult = 'APTO' | 'APTO_COM_RESTRICOES' | 'NAO_APTO';
export interface AssessmentEligibilityRequest { tenantId: string; customerId: string; serviceId: string; professionalId: string; }
export interface AssessmentEligibilityResponse { eligible: boolean; result?: AssessmentResult; }
