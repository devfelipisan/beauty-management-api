export type ReturnRecommendationStatus = 'PENDING' | 'CONVERTED';
export type ReturnIntervalUnit = 'DAY' | 'WEEK' | 'MONTH';
export interface ReturnRecommendation { id:string; tenantId:string; customerId:string; sessionId:string; serviceId:string; professionalId:string; status:ReturnRecommendationStatus; recommendedAt:string; recommendedFor?:string; intervalValue?:number; intervalUnit?:ReturnIntervalUnit; reasonCode?:string; observation?:string; appointmentId?:string; createdAt:string; convertedAt?:string; overdue?:boolean; }
export interface RecommendReturnRequest { tenantId:string; sessionId:string; required:boolean; interval?:{value:number;unit:ReturnIntervalUnit}; recommendedFor?:string; reasonCode?:string; observation?:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; }
export interface ReturnRecommendedEvent { eventId:string; tenantId:string; sessionId:string; customerId:string; serviceId:string; professionalId:string; recommendedFor?:string; interval?:{value:number;unit:ReturnIntervalUnit}; reasonCode?:string; correlationId:string; }
export interface ApplyReturnRecommendedRequest extends ReturnRecommendedEvent {}
export interface ApplyReturnRecommendedResponse { applied:boolean; recommendationId?:string; status:'PENDING'|'NOT_REQUIRED'; }
export interface ListReturnsQuery { tenantId:string; status?:ReturnRecommendationStatus; dueFrom?:string; dueTo?:string; customerId?:string; professionalId?:string; serviceId?:string; limit?:number; cursor?:string; }
