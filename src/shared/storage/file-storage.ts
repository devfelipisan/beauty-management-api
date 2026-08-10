import type { EntityId, IsoDateTime } from "@/shared/domain/core";

export interface FileReference {
  id: EntityId;
  tenantId: EntityId;
  name: string;
  contentType: string;
  sizeBytes: number;
  visibility: "private" | "public";
  createdAt: IsoDateTime;
}

export interface UploadFileInput {
  tenantId: EntityId;
  name: string;
  contentType: string;
  bytes: ArrayBuffer;
  visibility?: "private" | "public";
}

export interface FileStorage {
  upload(input: UploadFileInput): Promise<FileReference>;
  remove(tenantId: EntityId, fileId: EntityId): Promise<void>;
  getAccessUrl(tenantId: EntityId, fileId: EntityId, expiresInSeconds?: number): Promise<string>;
}
