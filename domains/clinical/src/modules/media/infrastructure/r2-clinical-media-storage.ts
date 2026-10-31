import { putImage } from '@beauty/reliability/media/r2-image-storage';
import type {
  ClinicalMediaStoragePort,
  R2ObjectBody,
  StoredObject,
} from '../ports/clinical-media-storage.port.js';

export class UnavailableClinicalMediaStorage implements ClinicalMediaStoragePort {
  readonly available = false;
  async put(): Promise<StoredObject> {
    throw new Error('CLINICAL_MEDIA_UNAVAILABLE');
  }
  async get(): Promise<R2ObjectBody | null> {
    throw new Error('CLINICAL_MEDIA_UNAVAILABLE');
  }
  async head(): Promise<null> {
    throw new Error('CLINICAL_MEDIA_UNAVAILABLE');
  }
}

export function clinicalMediaStorage(
  bucket?: R2Bucket,
): ClinicalMediaStoragePort {
  return bucket
    ? new R2ClinicalMediaStorage(bucket)
    : new UnavailableClinicalMediaStorage();
}

export class R2ClinicalMediaStorage implements ClinicalMediaStoragePort {
  constructor(private readonly bucket: R2Bucket) {}
  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    metadata: Record<string, string>,
    maxBytes: number,
    contentLength?: number,
  ): Promise<StoredObject> {
    return putImage(
      this.bucket,
      key,
      body,
      contentType,
      metadata,
      maxBytes,
      contentLength,
    );
  }
  async get(key: string): Promise<R2ObjectBody | null> {
    const object = await this.bucket.get(key);
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
    const object = await this.bucket.head(key);
    return object
      ? {
          size: object.size,
          etag: object.etag,
          contentType: object.httpMetadata?.contentType,
          metadata: object.customMetadata,
        }
      : null;
  }
}
