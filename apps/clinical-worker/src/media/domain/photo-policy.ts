import { PHOTO_CONTENT_TYPES } from './photo-attachment.js';
export function validatePhotoInput(contentType:string, contentLength:number|undefined, maxBytes:number) {
  if (!PHOTO_CONTENT_TYPES.includes(contentType as typeof PHOTO_CONTENT_TYPES[number])) throw new Error('PHOTO_CONTENT_TYPE_NOT_ALLOWED');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('PHOTO_CONFIGURATION_INVALID');
  if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > maxBytes)) throw new Error('PHOTO_SIZE_EXCEEDED');
}
export function photoObjectKey(tenantId:string, sessionId:string, photoId:string) { return `tenant/${encodeURIComponent(tenantId)}/sessions/${encodeURIComponent(sessionId)}/photos/${encodeURIComponent(photoId)}`; }
