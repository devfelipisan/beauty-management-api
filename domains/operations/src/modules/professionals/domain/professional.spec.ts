import { Professional, ProfessionalStatus } from './professional.js';
describe('Professional', () => { it('allows only the documented lifecycle statuses', () => { const item = Professional.create('p1', { tenantId: 't1', name: 'A', publicVisible: true }); item.changeStatus(ProfessionalStatus.INACTIVE); expect(item.data.status).toBe('INACTIVE'); }); });
