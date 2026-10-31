// Verified application authority cannot be supplied through HTTP JSON or RPC serialization.
const authorization = Symbol('verified-actor-authorization');
type Scope = { actorId: string; tenantId: string; professionalId?: string };

export function authorizeActor<T extends object>(command: T, scope: Scope): T {
  Object.defineProperty(command, authorization, {
    value: Object.freeze({ ...scope }),
    enumerable: false,
  });
  return command;
}

export function inheritActorAuthorization<T extends object>(
  source: object,
  command: T,
): T {
  const scope = (source as { [authorization]?: Scope })[authorization];
  return scope ? authorizeActor(command, scope) : command;
}

export function assertProfessionalAuthorization(
  command: { actorId: string; tenantId: string },
  professionalId: string,
): void {
  const scope = (command as { [authorization]?: Scope })[authorization];
  if (
    !scope ||
    scope.actorId !== command.actorId ||
    scope.tenantId !== command.tenantId ||
    (scope.professionalId && scope.professionalId !== professionalId)
  ) {
    throw new Error('PERMISSION_DENIED');
  }
}
