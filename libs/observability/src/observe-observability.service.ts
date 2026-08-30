import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';
import type { ObservabilityPort } from './contracts/observability.port.js';
import { TelemetrySanitizer } from './sanitization/telemetry-sanitizer.js';

@Injectable()
export class ObserveObservabilityService implements ObservabilityPort {
  constructor(
    private readonly tracer: TracerService,
    private readonly sanitizer: TelemetrySanitizer,
  ) {}

  async captureHandledError(
    error: unknown,
    attributes: Record<string, string | number | boolean> = {},
  ): Promise<void> {
    const safeAttributes = this.sanitizer.sanitize(attributes) as Record<
      string,
      string | number | boolean
    >;
    await this.tracer.captureError(
      error instanceof Error ? error : new Error(String(error)),
      safeAttributes,
    );
  }

  setAttribute(key: string, value: string | number | boolean): void {
    try {
      (this.tracer as unknown as {
        setAttribute(key: string, value: string | number | boolean): void;
      }).setAttribute(key, value);
    } catch {
      // Telemetry failure must not break the request.
    }
  }

  currentTraceId(): string | null {
    return this.tracer.currentTraceId();
  }
}
