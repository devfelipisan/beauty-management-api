import { DomainError } from '@beauty/kernel';
import type {
  ClinicalPhotoPurpose,
  ClinicalPhotoStatus,
} from '@beauty/contracts';

export const PHOTO_PURPOSES: ClinicalPhotoPurpose[] = [
  'BEFORE',
  'DURING',
  'AFTER',
  'INTERCURRENCE',
];
export const PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export interface PhotoAttachmentProps {
  idempotencyKey?: string;
  tenantId: string;
  sessionId: string;
  intercurrenceId?: string;
  purpose: ClinicalPhotoPurpose;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
  etag?: string;
  status: ClinicalPhotoStatus;
  capturedAt?: string;
  uploadedAt?: string;
  uploadedBy: string;
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
}
export class PhotoAttachment {
  private constructor(
    readonly id: string,
    private readonly props: PhotoAttachmentProps,
  ) {}
  static pending(
    id: string,
    props: Omit<PhotoAttachmentProps, 'status' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<PhotoAttachmentProps, 'createdAt' | 'updatedAt'>>,
    now = new Date().toISOString(),
  ) {
    if (
      !id ||
      !props.tenantId ||
      !props.sessionId ||
      !props.objectKey ||
      !props.uploadedBy ||
      !PHOTO_PURPOSES.includes(props.purpose) ||
      !PHOTO_CONTENT_TYPES.includes(
        props.contentType as (typeof PHOTO_CONTENT_TYPES)[number],
      ) ||
      !Number.isSafeInteger(props.sizeBytes) ||
      props.sizeBytes <= 0
    )
      throw new DomainError('PHOTO_INVALID', 'Photo metadata is invalid');
    if (props.purpose === 'INTERCURRENCE' && !props.intercurrenceId)
      throw new DomainError(
        'PHOTO_INTERCURRENCE_REQUIRED',
        'Intercurrence photo requires an intercurrence',
      );
    if (props.purpose !== 'INTERCURRENCE' && props.intercurrenceId)
      throw new DomainError(
        'PHOTO_INTERCURRENCE_INVALID',
        'Only intercurrence photos may reference an intercurrence',
      );
    return new PhotoAttachment(id, {
      ...props,
      status: 'PENDING_UPLOAD',
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }
  static restore(id: string, props: PhotoAttachmentProps) {
    return new PhotoAttachment(id, props);
  }
  get data(): Readonly<PhotoAttachmentProps> {
    return { ...this.props };
  }
}
