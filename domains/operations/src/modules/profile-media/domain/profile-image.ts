export const PROFILE_IMAGE_MAX_BYTES = 2_000_000;
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
  validate(contentType: string, size: number): void {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType))
      throw new Error('PHOTO_CONTENT_INVALID');
    if (!Number.isSafeInteger(size) || size < 1)
      throw new Error('PHOTO_CONTENT_INVALID');
    if (size > PROFILE_IMAGE_MAX_BYTES) throw new Error('PHOTO_SIZE_EXCEEDED');
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
