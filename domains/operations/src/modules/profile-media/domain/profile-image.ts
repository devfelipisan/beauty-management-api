export const PROFILE_IMAGE_MAX_BYTES = 300_000;
export interface ProfileImage {
  id: string;
  tenantId: string;
  ownerId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  etag?: string;
  version: number;
  status: 'PENDING' | 'AVAILABLE' | 'RETIRED' | 'REMOVED';
  uploadedBy: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}
export const ProfileImagePolicy = {
  validate(
    contentType: string,
    size: number,
    maxBytes = PROFILE_IMAGE_MAX_BYTES,
  ): void {
    if (maxBytes !== PROFILE_IMAGE_MAX_BYTES)
      throw new Error('INVALID_PROFILE_MEDIA_CONFIGURATION');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType))
      throw new Error('PHOTO_CONTENT_INVALID');
    if (!Number.isSafeInteger(size) || size < 1)
      throw new Error('PHOTO_CONTENT_INVALID');
    if (size > maxBytes) throw new Error('PHOTO_SIZE_EXCEEDED');
  },
};
export function profileMetadata(image: ProfileImage) {
  return {
    id: image.id,
    ownerType: 'customer' as const,
    ownerId: image.ownerId,
    imageRole: 'PROFILE' as const,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    version: image.version,
    updatedAt: image.updatedAt,
  };
}
