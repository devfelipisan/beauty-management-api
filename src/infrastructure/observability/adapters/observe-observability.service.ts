import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';
import type { ObservabilityPort } from '../contracts/observability.port.js';
import { isAllowedObservabilityAttribute } from '../policies/observability-attribute.policy.js';
import { isSensitiveObservabilityKey } from '../policies/sensitive-data.policy.js';

@Injectable()
export class ObserveObservabilityService implements ObservabilityPort {
  constructor(private readonly tracer: TracerService) {}
  createSpan<T>(name: string, callback: () => Promise<T>): Promise<T> {
    return this.tracer.createSpan(name, callback);
  }
  async captureHandledError(error: unknown, attributes: Record<string, string | number | boolean> = {}): Promise<void> {
    const safeAttributes = Object.fromEntries(Object.entries(attributes).filter(([key]) =>
      isAllowedObservabilityAttribute(key) && !isSensitiveObservabilityKey(key)));
    await this.tracer.captureError(error instanceof Error ? error : new Error(String(error)), safeAttributes);
  }
  setAttribute(key: string, value: string | number | boolean): void {
    if (!isAllowedObservabilityAttribute(key) || isSensitiveObservabilityKey(key)) return;
    try { (this.tracer as unknown as { setAttribute(key: string, value: string | number | boolean): void }).setAttribute(key, value); } catch { /* telemetry must not break requests */ }
  }
  currentTraceId(): string | null {
    return this.tracer.currentTraceId();
  }
}

