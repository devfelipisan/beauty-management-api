import { SetMetadata } from '@nestjs/common';

export const OBSERVABLE_OPERATION = 'observability:operation';
export const ObservableOperation = (operation: string) =>
  SetMetadata(OBSERVABLE_OPERATION, operation);
