import { HealthController } from './health.controller.js';
import type { RuntimeConfigService } from '../infrastructure/config/runtime-config.service.js';

describe('HealthController', () => {
  it('returns local liveness information', () => {
    const config = {
      serviceId: 'beauty-management-api',
      serviceVersion: 'test',
    } as RuntimeConfigService;
    const controller = new HealthController(config);

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'beauty-management-api',
      version: 'test',
    });
  });
});
