import { Controller, Get } from '@nestjs/common';
import { RuntimeConfigService } from '@beauty/config';

@Controller('health')
export class HealthController { constructor(private readonly config: RuntimeConfigService) {} @Get() getHealth() { return { status: 'ok' as const, service: this.config.serviceId, version: this.config.serviceVersion }; } }
