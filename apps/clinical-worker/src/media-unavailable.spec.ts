import { describe, expect, it, vi } from 'vitest';
import { ClinicalComposition } from './composition-root.js';
describe('disabled clinical media composition', () => {
  it('rejects binary operations without database or object writes', async () => {
    const prepare = vi.fn(),
      batch = vi.fn();
    const app = new ClinicalComposition({
      D1_DATABASE: { prepare, batch },
    } as never);
    await expect(app.uploadSessionPhoto({} as never)).rejects.toThrow(
      'CLINICAL_MEDIA_UNAVAILABLE',
    );
    await expect(app.getClinicalPhoto({} as never)).rejects.toThrow(
      'CLINICAL_MEDIA_UNAVAILABLE',
    );
    await expect(app.reconcilePhotoAttachment({} as never)).rejects.toThrow(
      'CLINICAL_MEDIA_UNAVAILABLE',
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });
});
