export const OBSERVABILITY_PORT = Symbol('OBSERVABILITY_PORT');

export interface ObservabilityPort {
  captureHandledError(
    error: unknown,
    attributes?: Record<string, string | number | boolean>,
  ): Promise<void>;
  setAttribute(key: string, value: string | number | boolean): void;
  currentTraceId(): string | null;
}
