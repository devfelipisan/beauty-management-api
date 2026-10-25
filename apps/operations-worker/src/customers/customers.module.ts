import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller.js';
import { D1CustomerRepository } from '@beauty/operations/modules/customers/infrastructure/d1-customer-repository';
import { CUSTOMER_REPOSITORY } from '@beauty/operations/modules/customers/ports/customer-repository';
import { CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase } from '@beauty/operations/modules/customers/application/use-cases';
import { TenancyModule } from '@beauty/tenancy';
import { AuthenticationModule } from '@beauty/authentication';

@Module({
  imports: [TenancyModule, AuthenticationModule],
  controllers: [CustomersController],
  providers: [D1CustomerRepository, { provide: CUSTOMER_REPOSITORY, useExisting: D1CustomerRepository }, CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase],
  exports: [CUSTOMER_REPOSITORY, CreateCustomerUseCase, DeactivateCustomerUseCase, GetCustomerUseCase, ListCustomersUseCase, UpdateCustomerUseCase],
})
export class CustomersModule {}
