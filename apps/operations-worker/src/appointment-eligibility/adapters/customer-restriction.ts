import { Inject, Injectable } from '@nestjs/common';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../customers/ports/customer-repository.js';
import type { CustomerRestrictionPort } from '../ports/customer-restriction.port.js';
@Injectable() export class CustomerRestrictionAdapter implements CustomerRestrictionPort { constructor(@Inject(CUSTOMER_REPOSITORY) private readonly repo:CustomerRepository){} async check(input:{tenantId:string;customerId:string}){const c=await this.repo.findById(input.tenantId,input.customerId); return {restricted:Boolean(c?.data.blockedForNewAppointments)};} }
