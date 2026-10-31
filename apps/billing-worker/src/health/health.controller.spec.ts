import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  it('returns the configured service identity and version', () => {
    expect(
      new HealthController({
        serviceId: 'billing',
        serviceVersion: 'sha',
      } as never).getHealth(),
    ).toEqual({ status: 'ok', service: 'billing', version: 'sha' });
  });
});
