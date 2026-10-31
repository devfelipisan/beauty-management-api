export interface StoredObject {
  etag?: string;
  size: number;
}
export interface HeadObject {
  size: number;
  etag?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}
export interface ClinicalMediaStoragePort {
  readonly available?: boolean;
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    metadata: Record<string, string>,
    maxBytes: number,
    contentLength?: number,
  ): Promise<StoredObject>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<HeadObject | null>;
}
export interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  size: number;
  etag?: string;
}
