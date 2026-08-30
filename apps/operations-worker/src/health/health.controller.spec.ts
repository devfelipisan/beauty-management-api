import { HealthController } from './health.controller.js';
import { RuntimeConfigService } from '../../../../libs/config/src/index.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController({
      serviceId: 'beauty-operations-worker',
      serviceVersion: 'test',
    } as RuntimeConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns a database-independent liveness payload', () => {
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'beauty-operations-worker',
      version: 'test',
    });
  });
});
