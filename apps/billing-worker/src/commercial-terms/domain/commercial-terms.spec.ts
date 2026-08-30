import { CommercialTerms } from './commercial-terms.js';
describe('CommercialTerms', () => {
  it('keeps monetary values in integer cents and derives final price', () => { expect(CommercialTerms.create({ basePriceCents:10000, discountCents:0, finalPriceCents:10000, depositRequired:false, depositCents:0 }).data.finalPriceCents).toBe(10000); });
  it('rejects discount above base and deposit above final', () => { expect(() => CommercialTerms.create({ basePriceCents:10000, discountCents:10001, finalPriceCents:-1, depositRequired:false, depositCents:0 })).toThrow('INVALID_COMMERCIAL_TERMS'); expect(() => CommercialTerms.create({ basePriceCents:10000, discountCents:0, finalPriceCents:10000, depositRequired:true, depositCents:10001 })).toThrow('INVALID_COMMERCIAL_TERMS'); });
});
