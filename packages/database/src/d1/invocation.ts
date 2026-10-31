import { AsyncLocalStorage } from 'node:async_hooks';
import type { D1DatabaseLike } from './d1.types.js';
import { limitedD1 } from './limited-d1.js';

const invocation = new AsyncLocalStorage<Map<object, object>>();
export function executionEnv<T extends { D1_DATABASE: D1DatabaseLike }>(
  env: T,
): T {
  const context = invocation.getStore();
  if (!context) throw new Error('INVOCATION_CONTEXT_REQUIRED');
  let scoped = context.get(env);
  if (!scoped) {
    scoped = { ...env, D1_DATABASE: limitedD1(env.D1_DATABASE) };
    context.set(env, scoped);
    context.set(scoped, scoped);
  }
  return scoped as T;
}

/** Retains the RPC prototype surface; internal delegation reuses the same store. */
export function scopeInvocation<T extends (...args: any[]) => any>(
  method: T,
): T {
  return function (this: unknown, ...args: Parameters<T>) {
    const invoke = () => method.apply(this, args);
    return invocation.getStore() ? invoke() : invocation.run(new Map(), invoke);
  } as T;
}
export function scopeEntrypoint(entrypoint: { prototype: object }): void {
  for (const name of Object.getOwnPropertyNames(entrypoint.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(
      entrypoint.prototype,
      name,
    )!;
    if (typeof descriptor.value !== 'function') continue;
    Object.defineProperty(entrypoint.prototype, name, {
      ...descriptor,
      value: scopeInvocation(descriptor.value),
    });
  }
}
