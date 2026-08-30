export interface CustomerRestriction { restricted: boolean; }
export interface CustomerRestrictionPort { check(input: { tenantId: string; customerId: string }): Promise<CustomerRestriction>; }
export const CUSTOMER_RESTRICTION = Symbol('CUSTOMER_RESTRICTION');
