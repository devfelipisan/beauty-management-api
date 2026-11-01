import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { requiredJwtSecretNames } from './config-contract.mjs';
test('installed Wrangler enforces required secrets through native inheritance and errors', () => {
  const source = readFileSync(
    'node_modules/wrangler/wrangler-dist/cli.js',
    'utf8',
  );
  const extract = (name) => {
    const value = source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
    assert.ok(value, `Installed Wrangler must provide ${name}`);
    return value;
  };
  class APIError extends Error {
    constructor() {
      super();
      this.code = 10021;
      this.notes = [{ text: "inherit binding 'AUTH_ISSUER' is invalid" }];
    }
    preventReport() {}
  }
  const native = runInNewContext(
    `${extract('addRequiredSecretsInheritBindings')}\n${extract('handleMissingSecretsError')}\n({addRequiredSecretsInheritBindings,handleMissingSecretsError})`,
    { UserError: Error, APIError, INVALID_INHERIT_BINDING_CODE: 10021 },
  );
  const config = { secrets: { required: [...requiredJwtSecretNames] } },
    bindings = {};
  native.addRequiredSecretsInheritBindings(config, bindings, {
    type: 'deploy',
    workerExists: true,
  });
  assert.deepEqual(Object.keys(bindings), [...requiredJwtSecretNames]);
  assert.ok(Object.values(bindings).every((b) => b.type === 'inherit'));
  assert.throws(
    () =>
      native.addRequiredSecretsInheritBindings(
        config,
        {},
        { type: 'deploy', workerExists: false },
      ),
    /required secrets have not been set/,
  );
  assert.throws(
    () =>
      native.handleMissingSecretsError(new APIError(), config, {
        type: 'deploy',
      }),
    /required secrets have not been set/,
  );
});
