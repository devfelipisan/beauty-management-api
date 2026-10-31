import { UploadSessionPhoto } from './use-cases.js';
import { UnavailableClinicalMediaStorage } from '../infrastructure/r2-clinical-media-storage.js';

describe('unavailable clinical storage', () => {
  it('rejects upload before creating metadata or reserving idempotency', async () => {
    const sessions = { findById: vi.fn() };
    const photos = { createPending: vi.fn() };
    const uow = { execute: vi.fn() };
    const upload = new UploadSessionPhoto(
      sessions as never,
      {} as never,
      photos as never,
      new UnavailableClinicalMediaStorage(),
      uow,
      {} as never,
    );
    await expect(upload.execute({} as never)).rejects.toThrow(
      'CLINICAL_MEDIA_UNAVAILABLE',
    );
    expect(sessions.findById).not.toHaveBeenCalled();
    expect(photos.createPending).not.toHaveBeenCalled();
    expect(uow.execute).not.toHaveBeenCalled();
  });
});
