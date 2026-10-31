import { evaluateVariation } from './variation.js';

describe('non-comparable variation values', () => {
  it.each([
    ['not-a-number', '1', '1'],
    ['1', 'NaN', '1'],
    ['1', '2', 'Infinity'],
  ])(
    'does not compare non-finite values (%s, %s, %s)',
    (previous, current, threshold) => {
      expect(
        evaluateVariation(previous, current, 'ABSOLUTE', threshold),
      ).toEqual({ status: 'NOT_COMPARABLE' });
    },
  );
});
