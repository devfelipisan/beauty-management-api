import { ProfessionalsController } from './professionals.controller.js';

describe('ProfessionalsController', () => {
  let controller: ProfessionalsController;

  beforeEach(() => {
    controller = new ProfessionalsController({} as never, {} as never, {} as never, {} as never, {} as never);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
