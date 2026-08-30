import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from './configuration.js';

@Injectable()
export class RuntimeConfigService {
  constructor(private readonly config: ConfigService) {}
  get environment(): AppEnvironment { return this.config.getOrThrow<AppEnvironment>('APP_ENV'); }
  get databaseUrl(): string { return this.config.getOrThrow<string>('DATABASE_URL'); }
  get port(): number { return this.config.get<number>('PORT', 3000); }
  get serviceId(): string { return this.config.getOrThrow<string>('SERVICE_ID'); }
  get serviceVersion(): string { return this.config.get<string>('SERVICE_VERSION', 'local'); }
  get observeEnabled(): boolean { return this.config.get<boolean>('OBSERVE_ENABLED', false); }
}
