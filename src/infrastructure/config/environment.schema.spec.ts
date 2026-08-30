import { environmentSchema } from './environment.schema.js';
const base = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://beauty:password@localhost:5432/beauty_management',
  SERVICE_ID: 'beauty-management-api',
};
describe('environmentSchema', () => {
  it('accepts local runtime without Observe credentials', () => {
    const result = environmentSchema.validate({
      ...base,
      OBSERVE_ENABLED: false,
    });
    expect(result.error).toBeUndefined();
  });
  it('requires both Observe credentials when enabled', () => {
    const result = environmentSchema.validate({
      ...base,
      OBSERVE_ENABLED: true,
      OBSERVE_APP_KEY: 'key',
    });
    expect(result.error?.message).toContain('OBSERVE_APP_SECRET');
  });
  it('requires Observe in production', () => {
    const result = environmentSchema.validate({
      ...base,
      APP_ENV: 'production',
    });
    expect(result.error?.message).toContain('OBSERVE_ENABLED');
  });
  it('rejects a missing database URL', () => {
    const result = environmentSchema.validate({
      APP_ENV: 'local',
      SERVICE_ID: base.SERVICE_ID,
    });
    expect(result.error).toBeDefined();
  });
});
