export const OBSERVABILITY_PORT = Symbol('OBSERVABILITY_PORT');

export interface ObservabilityPort {
  createSpan<T>(name: string, callback: () => Promise<T>): Promise<T>;
  captureHandledError(error: unknown, attributes?: Record<string, string | number | boolean>): Promise<void>;
  setAttribute(key: string, value: string | number | boolean): void;
  currentTraceId(): string | null;
}
