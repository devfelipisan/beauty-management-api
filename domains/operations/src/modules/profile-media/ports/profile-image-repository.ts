import type { TransactionContext } from '@beauty/reliability/unit-of-work/transaction-context';
import type { ProfileImage } from '../domain/profile-image.js';
export interface ProfileImageRepository {
  customerExists(tenantId: string, ownerId: string): Promise<boolean>;
  current(
    tenantId: string,
    ownerId: string,
  ): Promise<{ version: number; image: ProfileImage | null }>;
  find(tenantId: string, id: string): Promise<ProfileImage | null>;
  create(image: ProfileImage, tx: TransactionContext): void;
  activate(
    image: ProfileImage,
    etag: string | undefined,
    previous: ProfileImage | null,
    tx: TransactionContext,
  ): void;
  retire(image: ProfileImage, tx: TransactionContext): void;
  remove(
    tenantId: string,
    ownerId: string,
    version: number,
    image: ProfileImage | null,
    tx: TransactionContext,
  ): void;
  released(tenantId: string, id: string): Promise<boolean>;
  release(image: ProfileImage, tx: TransactionContext): void;
}
