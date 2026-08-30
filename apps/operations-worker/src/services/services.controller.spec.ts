import { ServicesController } from './services.controller.js';

describe('ServicesController', () => {
  let controller: ServicesController;

  beforeEach(() => {
    controller = new ServicesController({} as never, {} as never, {} as never, {} as never, {} as never);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
