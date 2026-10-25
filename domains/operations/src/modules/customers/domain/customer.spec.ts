import { Customer, CustomerStatus, RelationshipProfile } from './customer.js';
describe('Customer', () => { it('starts ACTIVE with NEW relationship profile', () => { const item = Customer.create('c1', { tenantId: 't1', fullName: 'Client' }); expect(item.data.status).toBe(CustomerStatus.ACTIVE); expect(item.data.relationshipProfile).toBe(RelationshipProfile.NEW); }); });
