export type ClinicalPhotoPurpose = 'BEFORE'|'DURING'|'AFTER'|'INTERCURRENCE';
export type ClinicalPhotoStatus = 'PENDING_UPLOAD'|'AVAILABLE'|'FAILED';
export type PhotoRequirementStatus = 'NOT_REQUIRED'|'REQUIRED_MISSING'|'REQUIRED_SATISFIED';
export interface ClinicalPhotoMetadata { id:string; tenantId:string; sessionId:string; intercurrenceId?:string; purpose:ClinicalPhotoPurpose; contentType:string; sizeBytes:number; capturedAt?:string; uploadedAt?:string; status:ClinicalPhotoStatus; }
export interface UploadClinicalPhotoRequest { tenantId:string; sessionId:string; intercurrenceId?:string; purpose:ClinicalPhotoPurpose; contentType:string; contentLength?:number; clientChecksum?:string; capturedAt?:string; originalFileName?:string; actorId:string; idempotencyKey:string; requestId:string; correlationId:string; body:ReadableStream<Uint8Array>; maxBytes:number; }
export interface PhotoRequirementResponse { status:PhotoRequirementStatus; missingPurposes:ClinicalPhotoPurpose[]; }
