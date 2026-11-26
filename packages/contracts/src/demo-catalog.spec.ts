import { expect, it } from 'vitest';
import { parseDemoCatalogInput, demoCatalogCapabilities } from './demo-catalog.js';

it('rejects authority injection, malformed references and invalid money/deposit input', () => {
  for (const input of [null, [], { fullName: 'X', phone: '123', actorId: 'user' }, { fullName: '', phone: '123' }]) {
    expect(() => parseDemoCatalogInput('customers', input)).toThrow('VALIDATION_ERROR');
  }
  for (const deposit of [
    { required: false, type: 'fixed', value: 10 }, { required: true, type: 'percentage', value: 101 },
    { required: true, type: 'fixed', value: 0.5 }, { required: true, type: 'percentage', value: 0.001 },
  ]) expect(() => parseDemoCatalogInput('services', { name: 'X', category: 'X', durationMinutes: 30, priceCents: 100, deposit })).toThrow('VALIDATION_ERROR');
  expect(() => parseDemoCatalogInput('professionals', { displayName: 'X', serviceIds: ['a', 'a'] })).toThrow();
});
it('normalizes equivalent input and exposes only implemented grants when explicitly enabled', () => {
  expect(parseDemoCatalogInput('customers', { phone: ' 123 ', fullName: ' Nome ' })).toEqual({ kind: 'customers', fullName: 'Nome', phone: '123' });
  expect(demoCatalogCapabilities(['customer.create', 'payment.create'], false).actions).toEqual([]);
  expect(demoCatalogCapabilities(['customer.create', 'payment.create'], true).actions).toEqual(['customer.create']);
  expect(demoCatalogCapabilities(['customer.create'], true, 'professional')).toMatchObject({ canWrite: false, actions: [] });
});
