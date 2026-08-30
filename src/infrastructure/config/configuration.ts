export type AppEnvironment =
  'local' | 'test' | 'development' | 'staging' | 'production';
export function isObserveEnabled(): boolean {
  return process.env.OBSERVE_ENABLED === 'true';
}
