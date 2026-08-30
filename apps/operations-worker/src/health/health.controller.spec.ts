import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { RuntimeConfigService } from '../../../../libs/config/src/index.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: RuntimeConfigService, useValue: {
        serviceId: 'beauty-operations-worker',
        serviceVersion: 'test',
      } }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
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
