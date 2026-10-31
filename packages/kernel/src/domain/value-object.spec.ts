import { ValueObject } from './value-object.js';
import { ValueObject as PublicValueObject } from '@beauty/kernel';

describe('ValueObject base contract', () => {
  it('provides the supplied properties to the derived value object', () => {
    class Amount extends ValueObject<{ cents: number }> {
      constructor(cents: number) {
        super({ cents });
      }
      get cents() {
        return this.props.cents;
      }
    }
    expect(new Amount(125).cents).toBe(125);
    class PublicAmount extends PublicValueObject<{ cents: number }> {
      constructor(cents: number) {
        super({ cents });
      }
      get cents() {
        return this.props.cents;
      }
    }
    expect(new PublicAmount(125).cents).toBe(125);
  });
});
