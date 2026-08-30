import { DomainError } from '../../../../../libs/kernel/src/index.js';
import type { SessionStatus } from './session.js';
export class SessionStateMachine { start():SessionStatus{return 'IN_PROGRESS';} transition(current:SessionStatus,event:'complete'):SessionStatus{if(current==='IN_PROGRESS'&&event==='complete')return 'COMPLETED';throw new DomainError('SESSION_TRANSITION_NOT_ALLOWED','Session transition is not allowed');} }
