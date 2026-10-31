import type { TechnicalFieldInput } from '@beauty/contracts';
import {
  TECHNICAL_FIELD_TYPES,
  isDecimal,
  validateField,
} from './technical-field-definition.js';
import { validateTechnicalValue } from './technical-value.js';

const field = (
  patch: Partial<TechnicalFieldInput> = {},
): TechnicalFieldInput => ({
  key: 'field',
  name: 'Field',
  type: 'SHORT_TEXT',
  order: 0,
  ...patch,
});
describe('technical field definitions', () => {
  it.each(TECHNICAL_FIELD_TYPES)(
    'accepts the defined field type %s with defaults',
    (type) => {
      expect(validateField(field({ type }))).toMatchObject({
        type,
        status: 'ACTIVE',
        required: false,
      });
    },
  );
  it('preserves explicit inactive/required fields and valid limits and precision', () => {
    const input = field({
      type: 'DECIMAL',
      minimum: '-1.5',
      maximum: '2',
      precision: 2,
      required: true,
      status: 'INACTIVE',
    });
    expect(validateField(input)).toEqual(input);
    expect(validateField(input)).not.toBe(input);
  });
  it.each([
    { key: '' },
    { name: ' ' },
    { type: 'INVALID' },
    { order: -1 },
    { order: 0.5 },
    { precision: -1 },
    { precision: 1.5 },
    { minimum: '1e2' },
    { maximum: 'NaN' },
    { options: ['a'] },
    { type: 'SINGLE_SELECT', options: ['a', 'a'] },
    { type: 'MULTI_SELECT', options: [' '] },
  ])('rejects invalid definition %j', (patch) => {
    expect(() => validateField(field(patch as never))).toThrow();
  });
  it.each(['SINGLE_SELECT', 'MULTI_SELECT'] as const)(
    'accepts distinct options for %s',
    (type) => {
      expect(
        validateField(field({ type, options: ['a', 'b'] })).options,
      ).toEqual(['a', 'b']);
    },
  );
  it.each([
    ['0', true],
    ['-12.50', true],
    ['01', false],
    ['1e2', false],
    ['NaN', false],
    [1, false],
    [null, false],
  ])('recognizes the current decimal grammar for %s', (value, expected) => {
    expect(isDecimal(value)).toBe(expected);
  });
});

describe('technical value validation', () => {
  it.each([
    ['SHORT_TEXT', 'value'],
    ['LONG_TEXT', 'long text'],
    ['BOOLEAN', false],
    ['DATE', '2026-10-31'],
    ['TIME', '23:59'],
    ['INTEGER', 2],
    ['DECIMAL', '1.25'],
    ['DECIMAL', 1.25],
    ['PERCENTAGE', '12.5'],
    ['SINGLE_SELECT', 'a'],
    ['MULTI_SELECT', ['a', 'b']],
  ] as const)('accepts an existing %s value', (type, value) => {
    expect(() =>
      validateTechnicalValue(field({ type, options: ['a', 'b'] }), value),
    ).not.toThrow();
  });
  it.each([
    ['SHORT_TEXT', 1],
    ['LONG_TEXT', {}],
    ['BOOLEAN', 'false'],
    ['DATE', 'yesterday'],
    ['DATE', '2026-99-99'],
    ['TIME', '24:00'],
    ['INTEGER', '2'],
    ['INTEGER', 1.5],
    ['DECIMAL', '1e2'],
    ['PERCENTAGE', Infinity],
    ['SINGLE_SELECT', 'other'],
    ['SINGLE_SELECT', 1],
    ['MULTI_SELECT', 'a'],
    ['MULTI_SELECT', ['a', 'a']],
    ['MULTI_SELECT', [1]],
    ['MULTI_SELECT', ['other']],
  ] as const)('rejects an invalid %s value (%j)', (type, value) => {
    expect(() =>
      validateTechnicalValue(field({ type, options: ['a', 'b'] }), value),
    ).toThrow('Invalid value for field');
  });
  it('checks precision, inclusive limits and measurement unit without rounding input', () => {
    const numeric = field({
      type: 'DECIMAL',
      minimum: '1',
      maximum: '2',
      precision: 2,
    });
    for (const value of ['1', '2', '1.25'])
      expect(() => validateTechnicalValue(numeric, value)).not.toThrow();
    for (const value of ['0.99', '2.01', '1.001'])
      expect(() => validateTechnicalValue(numeric, value)).toThrow();
    expect(() =>
      validateTechnicalValue(field({ type: 'DECIMAL', precision: 0 }), '2'),
    ).not.toThrow();
    const measurement = field({ type: 'MEASUREMENT', unit: 'cm' });
    expect(() => validateTechnicalValue(measurement, '2', 'cm')).not.toThrow();
    expect(() => validateTechnicalValue(measurement, '2', 'mm')).toThrow();
    expect(() =>
      validateTechnicalValue(field({ type: 'MEASUREMENT' }), '2'),
    ).toThrow();
    expect(() =>
      validateTechnicalValue(field({ unit: 'cm' }), 'text', 'mm'),
    ).toThrow();
    expect(() =>
      validateTechnicalValue(field({ unit: 'cm' }), 'text'),
    ).not.toThrow();
    expect(() =>
      validateTechnicalValue(field({ type: 'SINGLE_SELECT' }), 'a'),
    ).toThrow();
    expect(() =>
      validateTechnicalValue(field({ type: 'MULTI_SELECT' }), ['a']),
    ).toThrow();
  });
});
