import { DomainError } from '../../../../../libs/kernel/src/index.js';
import { DepositStatus } from './deposit.js';

const transitions: Record<DepositStatus, Partial<Record<'confirm' | 'expire' | 'cancel', DepositStatus>>> = {
  PENDING: { confirm: 'CONFIRMED', expire: 'EXPIRED', cancel: 'CANCELED' },
  CONFIRMED: {}, EXPIRED: {}, CANCELED: {},
};

export class DepositStateMachine {
  transition(current: DepositStatus, event: 'confirm' | 'expire' | 'cancel'): DepositStatus {
    const next = transitions[current][event];
    if (!next) throw new DomainError('DEPOSIT_TRANSITION_NOT_ALLOWED', `${event} is not allowed from ${current}`);
    return next;
  }
}
