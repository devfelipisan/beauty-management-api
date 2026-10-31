import { putImage } from '@beauty/reliability/media/r2-image-storage';
import { PROFILE_IMAGE_MAX_BYTES } from '../domain/profile-image.js';
import type { ProfileImageStoragePort } from '../ports/profile-image-storage.js';
export class R2ProfileImageStorage implements ProfileImageStoragePort {
  constructor(private readonly bucket?: R2Bucket) {}
  private storage() {
    if (!this.bucket) throw new Error('PROFILE_MEDIA_UNAVAILABLE');
    return this.bucket;
  }
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    type: string,
    size: number,
    metadata: Record<string, string>,
  ) {
    return putImage(
      this.storage(),
      key,
      body,
      type,
      metadata,
      PROFILE_IMAGE_MAX_BYTES,
      size,
    );
  }
  async get(key: string) {
    const object = await this.storage().get(key);
    return object
      ? {
          body: object.body,
          size: object.size,
          etag: object.etag,
          contentType: object.httpMetadata?.contentType,
        }
      : null;
  }
  async head(key: string) {
    const object = await this.storage().head(key);
    return object
      ? {
          size: object.size,
          etag: object.etag,
          contentType: object.httpMetadata?.contentType,
          metadata: object.customMetadata,
        }
      : null;
  }
  async delete(key: string) {
    await this.storage().delete(key);
  }
}
