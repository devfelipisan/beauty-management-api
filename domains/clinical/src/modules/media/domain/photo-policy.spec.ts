import { PhotoAttachment } from './photo-attachment.js';
import { photoObjectKey, validatePhotoInput } from './photo-policy.js';

const metadata = {
  tenantId: 'tenant',
  sessionId: 'session',
  purpose: 'BEFORE' as const,
  objectKey: 'object',
  contentType: 'image/jpeg',
  sizeBytes: 8,
  uploadedBy: 'actor',
};

describe('clinical photo metadata and input policies', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'accepts the supported type %s at the size boundary',
    (type) => {
      expect(() => validatePhotoInput(type, 8, 8)).not.toThrow();
      expect(() => validatePhotoInput(type, undefined, 8)).not.toThrow();
    },
  );
  it('rejects unsupported content before accepting any metadata', () => {
    expect(() => validatePhotoInput('text/plain', 1, 8)).toThrow(
      'PHOTO_CONTENT_TYPE_NOT_ALLOWED',
    );
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects an invalid configured limit %s',
    (max) => {
      expect(() => validatePhotoInput('image/png', 1, max)).toThrow(
        'PHOTO_CONFIGURATION_INVALID',
      );
    },
  );
  it.each([0, -1, 1.5, 9, NaN])(
    'rejects an invalid content size %s',
    (size) => {
      expect(() => validatePhotoInput('image/png', size, 8)).toThrow(
        'PHOTO_SIZE_EXCEEDED',
      );
    },
  );
  it('encodes each object key segment independently', () => {
    expect(photoObjectKey('a/b', 'session ?', 'photo#')).toBe(
      'tenant/a%2Fb/sessions/session%20%3F/photos/photo%23',
    );
  });
  it('creates pending metadata with explicit timestamps and exposes a defensive copy', () => {
    const photo = PhotoAttachment.pending('photo', metadata, 'now');
    expect(photo.data).toMatchObject({
      ...metadata,
      status: 'PENDING_UPLOAD',
      createdAt: 'now',
      updatedAt: 'now',
    });
    const copy = photo.data;
    (copy as { objectKey: string }).objectKey = 'tampered';
    expect(photo.data.objectKey).toBe('object');
    const restored = PhotoAttachment.restore(photo.id, {
      ...photo.data,
      status: 'AVAILABLE',
      createdAt: 'original',
    });
    expect(restored.data).toMatchObject({
      status: 'AVAILABLE',
      createdAt: 'original',
    });
    expect(
      PhotoAttachment.pending('p', {
        ...metadata,
        createdAt: 'created',
        updatedAt: 'updated',
      }).data,
    ).toMatchObject({ createdAt: 'created', updatedAt: 'updated' });
  });
  it.each([
    { tenantId: '' },
    { sessionId: '' },
    { objectKey: '' },
    { uploadedBy: '' },
    { purpose: 'INVALID' },
    { contentType: 'text/plain' },
    { sizeBytes: 0 },
    { sizeBytes: 1.5 },
  ])('rejects invalid metadata %j', (patch) => {
    expect(() =>
      PhotoAttachment.pending('p', { ...metadata, ...patch } as never),
    ).toThrow('Photo metadata is invalid');
  });
  it('requires an identifier and enforces the existing intercurrence reference policy', () => {
    expect(() => PhotoAttachment.pending('', metadata)).toThrow(
      'Photo metadata is invalid',
    );
    expect(() =>
      PhotoAttachment.pending('p', { ...metadata, purpose: 'INTERCURRENCE' }),
    ).toThrow('Intercurrence photo requires an intercurrence');
    expect(() =>
      PhotoAttachment.pending('p', { ...metadata, intercurrenceId: 'other' }),
    ).toThrow('Only intercurrence photos may reference an intercurrence');
    expect(
      PhotoAttachment.pending('p', {
        ...metadata,
        purpose: 'INTERCURRENCE',
        intercurrenceId: 'incident',
      }).data.intercurrenceId,
    ).toBe('incident');
  });
});
