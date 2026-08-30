import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { D1CustomerRepository } from './adapters/d1-customer-repository.js';
import { CUSTOMER_REPOSITORY } from './ports/customer-repository.js';
import { CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase } from './application/use-cases.js';
import { TenancyModule } from '../../../../libs/tenancy/src/index.js';

@Module({
  imports: [TenancyModule],
  controllers: [CustomersController],
  providers: [D1CustomerRepository, { provide: CUSTOMER_REPOSITORY, useExisting: D1CustomerRepository }, CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase],
  exports: [CUSTOMER_REPOSITORY, CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase],
})
export class CustomersModule {}
