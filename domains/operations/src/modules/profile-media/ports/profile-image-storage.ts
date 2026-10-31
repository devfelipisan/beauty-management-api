export interface ProfileStoredObject {
  size: number;
  etag?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}
export interface ProfileImageStoragePort {
  put(
    imageKey: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    size: number,
    metadata: Record<string, string>,
  ): Promise<ProfileStoredObject>;
  get(
    imageKey: string,
  ): Promise<
    (ProfileStoredObject & { body: ReadableStream<Uint8Array> }) | null
  >;
  head(imageKey: string): Promise<ProfileStoredObject | null>;
  delete(imageKey: string): Promise<void>;
}
