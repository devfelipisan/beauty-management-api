import { Controller, Get } from '@nestjs/common';
import { RuntimeConfigService } from '../infrastructure/config/runtime-config.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly config: RuntimeConfigService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok' as const,
      service: this.config.serviceId,
      version: this.config.serviceVersion,
    };
  }
}
