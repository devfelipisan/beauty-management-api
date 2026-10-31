import { ImageWriteNotStartedError } from './image-write-error.js';

export async function putImage(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  contentType: string,
  metadata: Record<string, string>,
  maxBytes: number,
  contentLength?: number,
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error('PHOTO_INVALID');
  if (contentLength === undefined)
    throw new Error('PHOTO_CONTENT_LENGTH_REQUIRED');
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0)
    throw new Error('PHOTO_CONTENT_INVALID');
  if (contentLength > maxBytes) throw new Error('PHOTO_SIZE_EXCEEDED');
  const reader = body.getReader();
  const prefix: Uint8Array[] = [];
  let buffered = 0;
  const needed =
    contentType === 'image/jpeg' ? 3 : contentType === 'image/png' ? 8 : 12;
  try {
    while (buffered < needed) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('PHOTO_CONTENT_INVALID');
      buffered += chunk.value.byteLength;
      if (buffered > contentLength || buffered > maxBytes)
        throw new Error('PHOTO_SIZE_EXCEEDED');
      prefix.push(chunk.value);
    }
    const header = new Uint8Array(needed);
    let offset = 0;
    for (const chunk of prefix) {
      const part = chunk.subarray(0, needed - offset);
      header.set(part, offset);
      offset += part.length;
      if (offset === needed) break;
    }
    if (!validMagic(contentType, header))
      throw new Error('PHOTO_CONTENT_INVALID');
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw new ImageWriteNotStartedError(
      error instanceof Error ? error.message : 'PHOTO_CONTENT_INVALID',
    );
  }
  let sent = 0;
  const upload = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = prefix.length
          ? { value: prefix.shift()!, done: false }
          : await reader.read();
        if (chunk.done) {
          if (sent !== contentLength)
            throw new Error('PHOTO_CONTENT_LENGTH_MISMATCH');
          controller.close();
          return;
        }
        sent += chunk.value.byteLength;
        if (sent > maxBytes || sent > contentLength)
          throw new Error('PHOTO_SIZE_EXCEEDED');
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
        await reader.cancel(error).catch(() => undefined);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  const fixed = new FixedLengthStream(contentLength);
  const abort = new AbortController();
  const pumping = upload.pipeTo(fixed.writable, { signal: abort.signal });
  const storing = Promise.resolve()
    .then(() =>
      bucket.put(key, fixed.readable as unknown as ReadableStream<any>, {
        httpMetadata: { contentType },
        customMetadata: metadata,
      }),
    )
    .catch((error) => {
      abort.abort(error);
      throw error;
    });
  const [stored, pumped] = await Promise.allSettled([storing, pumping]);
  if (stored.status === 'rejected') throw stored.reason;
  if (pumped.status === 'rejected') throw pumped.reason;
  if (!stored.value) throw new Error('PHOTO_STORAGE_FAILED');
  return { size: contentLength, etag: stored.value.etag };
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
