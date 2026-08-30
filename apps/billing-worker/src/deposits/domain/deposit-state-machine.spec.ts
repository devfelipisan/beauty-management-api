import { DepositStateMachine } from './deposit-state-machine.js';

describe('DepositStateMachine', () => {
  const machine = new DepositStateMachine();

  it('accepts confirmation, expiration and cancellation only from PENDING', () => {
    expect(machine.transition('PENDING', 'confirm')).toBe('CONFIRMED');
    expect(machine.transition('PENDING', 'expire')).toBe('EXPIRED');
    expect(machine.transition('PENDING', 'cancel')).toBe('CANCELED');
  });

  it('rejects transitions from terminal states', () => {
    expect(() => machine.transition('CONFIRMED', 'expire')).toThrowError(expect.objectContaining({ code: 'DEPOSIT_TRANSITION_NOT_ALLOWED' }));
    expect(() => machine.transition('EXPIRED', 'confirm')).toThrowError(expect.objectContaining({ code: 'DEPOSIT_TRANSITION_NOT_ALLOWED' }));
  });
});
