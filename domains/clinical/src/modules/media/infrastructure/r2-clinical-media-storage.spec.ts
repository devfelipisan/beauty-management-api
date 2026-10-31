import {
  clinicalMediaStorage,
  R2ClinicalMediaStorage,
  UnavailableClinicalMediaStorage,
} from './r2-clinical-media-storage.js';

const stream = (...chunks: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });

describe('clinical media storage adapters (unit)', () => {
  it('accepts fragmented signatures and rejects bytes beyond the declared length', async () => {
    vi.stubGlobal(
      'FixedLengthStream',
      class extends TransformStream {
        constructor() {
          super();
        }
      },
    );
    const put = vi.fn(
      async (_key: string, body: ReadableStream<Uint8Array>) => {
        for await (const _chunk of body) {
          /* consume the complete stream */
        }
        return { etag: 'etag' };
      },
    );
    const storage = new R2ClinicalMediaStorage({ put } as never);
    await expect(
      storage.put(
        'fragmented',
        stream([255], [216], [255], [0]),
        'image/jpeg',
        {},
        4,
        4,
      ),
    ).resolves.toEqual({ size: 4, etag: 'etag' });
    await expect(
      storage.put(
        'extra',
        stream([255, 216, 255], [0]),
        'image/jpeg',
        {},
        4,
        3,
      ),
    ).rejects.toThrow('PHOTO_SIZE_EXCEEDED');
    expect(put).toHaveBeenCalledTimes(2);
  });
  it('forwards destination cancellation to the original body reader', async () => {
    vi.stubGlobal(
      'FixedLengthStream',
      class extends TransformStream {
        constructor() {
          super();
        }
      },
    );
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([255, 216, 255]));
      },
      cancel,
    });
    const reason = new Error('DESTINATION_CANCELED');
    const put = vi.fn(
      async (_key: string, readable: ReadableStream<Uint8Array>) => {
        await readable.cancel(reason);
        return { etag: 'unused' };
      },
    );
    const storage = new R2ClinicalMediaStorage({ put } as never);
    await expect(storage.put('key', body, 'image/jpeg', {}, 8, 8)).rejects.toBe(
      reason,
    );
    expect(cancel).toHaveBeenCalledWith(reason);
  });
  it('streams intermediate chunks and closes on source EOF while leaving fixed-length enforcement to the runtime', async () => {
    // Deliberately a pass-through double: this assertion covers adapter streaming,
    // not acceptance of a size mismatch by Cloudflare FixedLengthStream.
    vi.stubGlobal(
      'FixedLengthStream',
      class extends TransformStream {
        constructor() {
          super();
        }
      },
    );
    const bytes: number[] = [];
    const put = vi.fn(
      async (_key: string, readable: ReadableStream<Uint8Array>) => {
        for await (const chunk of readable) bytes.push(...chunk);
        return { etag: 'etag' };
      },
    );
    const storage = new R2ClinicalMediaStorage({ put } as never);
    await expect(
      storage.put(
        'key',
        stream([255, 216, 255], [1], [2]),
        'image/jpeg',
        {},
        8,
        8,
      ),
    ).rejects.toThrow('PHOTO_CONTENT_LENGTH_MISMATCH');
    expect(bytes).toEqual([255, 216, 255, 1, 2]);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('selects unavailable storage explicitly and rejects all I/O', async () => {
    const storage = clinicalMediaStorage();
    expect(storage).toBeInstanceOf(UnavailableClinicalMediaStorage);
    expect(storage.available).toBe(false);
    await expect(
      storage.put('key', stream(), 'image/jpeg', {}, 8, 8),
    ).rejects.toThrow('CLINICAL_MEDIA_UNAVAILABLE');
    await expect(storage.get('key')).rejects.toThrow(
      'CLINICAL_MEDIA_UNAVAILABLE',
    );
    await expect(storage.head('key')).rejects.toThrow(
      'CLINICAL_MEDIA_UNAVAILABLE',
    );
  });
  it('maps object metadata and absence without manufacturing an object', async () => {
    const body = stream([1]);
    const bucket = {
      get: vi.fn().mockResolvedValue({
        body,
        size: 1,
        etag: 'tag',
        httpMetadata: { contentType: 'image/jpeg' },
      }),
      head: vi.fn().mockResolvedValue({ size: 1, etag: 'tag' }),
    };
    const storage = clinicalMediaStorage(bucket as never);
    expect(storage).toBeInstanceOf(R2ClinicalMediaStorage);
    expect(await storage.get('key')).toEqual({
      body,
      size: 1,
      etag: 'tag',
      contentType: 'image/jpeg',
    });
    expect(await storage.head('key')).toEqual({ size: 1, etag: 'tag' });
    expect(bucket.get).toHaveBeenCalledWith('key');
    expect(bucket.head).toHaveBeenCalledWith('key');
    bucket.get.mockResolvedValue({ body, size: 1, etag: 'tag' });
    expect(await storage.get('key')).toMatchObject({ contentType: undefined });
    bucket.get.mockResolvedValue(null);
    bucket.head.mockResolvedValue(null);
    expect(await storage.get('key')).toBeNull();
    expect(await storage.head('key')).toBeNull();
  });
  it.each([
    [
      'image/jpeg',
      [
        [255, 216, 255],
        [1, 2],
      ],
    ],
    ['image/png', [[137, 80, 78, 71, 13, 10, 26, 10]]],
    ['image/webp', [[82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]]],
  ] as const)(
    'streams a valid %s with metadata into the bucket',
    async (type, chunks) => {
      // Only the stream interface is doubled; Cloudflare fixed-length semantics belong to runtime tests.
      vi.stubGlobal(
        'FixedLengthStream',
        class extends TransformStream {
          constructor() {
            super();
          }
        },
      );
      const bytes: number[] = [];
      const put = vi.fn(
        async (_key: string, body: ReadableStream<Uint8Array>) => {
          for await (const chunk of body) bytes.push(...chunk);
          return { etag: 'stored-tag' };
        },
      );
      const storage = new R2ClinicalMediaStorage({ put } as never);
      const input = chunks.map((chunk) => [...chunk]);
      const length = input.flat().length;
      expect(
        await storage.put(
          'object',
          stream(...input),
          type,
          { tenantId: 'tenant' },
          length,
          length,
        ),
      ).toEqual({ size: length, etag: 'stored-tag' });
      expect(bytes).toEqual(input.flat());
      expect(put).toHaveBeenCalledWith('object', expect.any(ReadableStream), {
        httpMetadata: { contentType: type },
        customMetadata: { tenantId: 'tenant' },
      });
    },
  );
  it.each([
    ['image/jpeg', []],
    ['image/jpeg', [[255]]],
    ['image/jpeg', [[0, 216, 255]]],
    ['image/png', [[137, 80, 78, 71, 13, 10, 26, 0]]],
    ['image/webp', [[82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 0]]],
    ['text/plain', [[1, 2, 3]]],
  ] as const)(
    'rejects invalid file bytes for %s before bucket I/O',
    async (type, chunks) => {
      const put = vi.fn();
      const storage = new R2ClinicalMediaStorage({ put } as never);
      await expect(
        storage.put(
          'key',
          stream(...chunks.map((chunk) => [...chunk])),
          type,
          {},
          20,
          20,
        ),
      ).rejects.toThrow('PHOTO_CONTENT_INVALID');
      expect(put).not.toHaveBeenCalled();
    },
  );
  it('requires bounded content length before accessing the stream or bucket', async () => {
    const put = vi.fn();
    const storage = new R2ClinicalMediaStorage({ put } as never);
    await expect(
      storage.put('key', stream(), 'image/jpeg', {}, 8),
    ).rejects.toThrow('PHOTO_CONTENT_LENGTH_REQUIRED');
    await expect(
      storage.put('key', stream(), 'image/jpeg', {}, 8, 9),
    ).rejects.toThrow('PHOTO_SIZE_EXCEEDED');
    expect(put).not.toHaveBeenCalled();
  });
  it('reports an absent stored object after consuming the upload stream', async () => {
    vi.stubGlobal(
      'FixedLengthStream',
      class extends TransformStream {
        constructor() {
          super();
        }
      },
    );
    const put = vi.fn(
      async (_key: string, body: ReadableStream<Uint8Array>) => {
        for await (const _chunk of body) {
          /* consume upload */
        }
        return null;
      },
    );
    const storage = new R2ClinicalMediaStorage({ put } as never);
    await expect(
      storage.put('key', stream([255, 216, 255]), 'image/jpeg', {}, 3, 3),
    ).rejects.toThrow('PHOTO_STORAGE_FAILED');
  });
});
