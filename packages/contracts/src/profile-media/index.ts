/** Additive customer projection; absent slot means version zero. */
export interface ProfileImageMetadata {
  id: string;
  ownerType: 'customer';
  ownerId: string;
  imageRole: 'PROFILE';
  contentType: string;
  sizeBytes: number;
  version: number;
  updatedAt: string;
}
export interface ProfileImageSlot {
  version: number;
  image: ProfileImageMetadata | null;
}
