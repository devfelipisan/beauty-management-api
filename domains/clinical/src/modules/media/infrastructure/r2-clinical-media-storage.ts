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
    if (contentLength === undefined)
      throw new Error('PHOTO_CONTENT_LENGTH_REQUIRED');
    if (contentLength > maxBytes) throw new Error('PHOTO_SIZE_EXCEEDED');
    const reader = body.getReader();
    const first = await reader.read();
    if (first.done || !validMagic(contentType, first.value))
      throw new Error('PHOTO_CONTENT_INVALID');
    let firstChunk = true;
    let sent = 0;
    const upload = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (firstChunk) {
          firstChunk = false;
          sent += first.value.byteLength;
          controller.enqueue(first.value);
          if (sent >= contentLength) controller.close();
          return;
        }
        const next = await reader.read();
        if (next.done) controller.close();
        else {
          sent += next.value.byteLength;
          controller.enqueue(next.value);
          if (sent >= contentLength) controller.close();
        }
      },
      cancel: (reason) => reader.cancel(reason),
    });
    const fixed = new FixedLengthStream(contentLength);
    const pumping = upload.pipeTo(fixed.writable);
    const object = await this.bucket.put(
      key,
      fixed.readable as unknown as ReadableStream<any>,
      { httpMetadata: { contentType }, customMetadata: metadata },
    );
    await pumping;
    if (!object) throw new Error('PHOTO_STORAGE_FAILED');
    return { size: contentLength, etag: object.etag };
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
    return object ? { size: object.size, etag: object.etag } : null;
  }
}
function validMagic(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg')
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (type === 'image/png')
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  if (type === 'image/webp')
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  return false;
}
