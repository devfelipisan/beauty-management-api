import type { CustomerRepository } from '../../customers/ports/customer-repository.js';
import type { CustomerRestrictionPort } from '../ports/customer-restriction.port.js';
export class CustomerRestrictionAdapter implements CustomerRestrictionPort { constructor(private readonly repo:CustomerRepository){} async check(input:{tenantId:string;customerId:string}){const c=await this.repo.findById(input.tenantId,input.customerId); return {restricted:Boolean(c?.data.blockedForNewAppointments)};} }
