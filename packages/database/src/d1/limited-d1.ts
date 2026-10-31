import type { DatabasePreparedStatement } from '../ports/database-session.js';
import type { D1DatabaseLike } from './d1.types.js';

/** One instance per invocation; statements retain their native batch identity. */
export function limitedD1(
  database: D1DatabaseLike,
  maximum = 5,
): D1DatabaseLike {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error('INVALID_D1_LIMIT');
  let active = 0;
  const waiting: Array<() => void> = [];
  const native = new WeakMap<
    DatabasePreparedStatement,
    DatabasePreparedStatement
  >();
  async function execute<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= maximum)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await operation();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  function wrap(
    statement: DatabasePreparedStatement,
  ): DatabasePreparedStatement {
    const wrapped: DatabasePreparedStatement = {
      bind: (...values) => wrap(statement.bind(...values)),
      first: <T>() => execute(() => statement.first<T>()),
      all: <T>() => execute(() => statement.all<T>()),
      run: () => execute(() => statement.run()),
    };
    native.set(wrapped, statement);
    return wrapped;
  }
  return {
    prepare: (query) => wrap(database.prepare(query)),
    batch: (statements) =>
      execute(() =>
        database.batch(
          statements.map((statement) => {
            const original = native.get(statement);
            if (!original) throw new Error('D1_STATEMENT_CONTEXT_MISMATCH');
            return original;
          }),
        ),
      ),
  };
}
