import { CustomersController } from './customers.controller.js';

describe('CustomersController', () => {
  let controller: CustomersController;

  beforeEach(() => {
    controller = new CustomersController({} as never, {} as never, {} as never, {} as never, {} as never);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
