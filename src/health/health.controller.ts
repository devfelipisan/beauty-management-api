import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database/database.service.js';
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      await this.database.isReachable();
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { database: 'down' },
      });
    }
  }
}
