import { ConflictError } from "../core";

export type TransitionMap<TState extends string, TAction extends string> = Readonly<{
  [State in TState]: Readonly<Partial<Record<TAction, TState>>>;
}>;

export interface StateMachine<TState extends string, TAction extends string> {
  can(state: TState, action: TAction): boolean;
  transition(state: TState, action: TAction): TState;
  allowedActions(state: TState): readonly TAction[];
}

export interface CreateStateMachineOptions<TState extends string, TAction extends string> {
  name: string;
  transitions: TransitionMap<TState, TAction>;
  errorCode?: string;
}

export function createStateMachine<TState extends string, TAction extends string>(
  options: CreateStateMachineOptions<TState, TAction>,
): StateMachine<TState, TAction> {
  const errorCode = options.errorCode ?? "INVALID_STATE_TRANSITION";
  function allowedActions(state: TState): readonly TAction[] {
    return Object.keys(options.transitions[state]) as TAction[];
  }
  return {
    can(state, action) {
      return options.transitions[state][action] !== undefined;
    },
    transition(state, action) {
      const next = options.transitions[state][action];
      if (!next) {
        throw new ConflictError(errorCode, `${options.name} cannot execute ${action} while in status ${state}.`, {
          state,
          action,
          allowedActions: allowedActions(state),
        });
      }
      return next;
    },
    allowedActions,
  };
}
