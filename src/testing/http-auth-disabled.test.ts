import assert from "node:assert/strict";
import test from "node:test";
import app from "@/index";

const readPaths = [
  "/v1/professionals",
  "/v1/services",
  "/v1/customers",
  "/v1/appointments",
  "/v1/payments",
  "/v1/leads",
] as const;

test("auth-disabled mode serves core tenant reads without Authorization or x-tenant-id", async () => {
  const previousAuthMode = process.env.API_AUTH_MODE;
  const previousSubject = process.env.API_DEV_AUTH_SUBJECT;
  const previousTenant = process.env.API_DEV_TENANT_ID;

  delete process.env.API_AUTH_MODE;
  delete process.env.API_DEV_AUTH_SUBJECT;
  delete process.env.API_DEV_TENANT_ID;

  try {
    for (const path of readPaths) {
      const response = await app.request(path);
      const body = await response.text();
      assert.equal(response.status, 200, `${path} returned ${response.status}: ${body}`);
      assert.doesNotThrow(() => JSON.parse(body));
    }
  } finally {
    if (previousAuthMode === undefined) delete process.env.API_AUTH_MODE;
    else process.env.API_AUTH_MODE = previousAuthMode;
    if (previousSubject === undefined) delete process.env.API_DEV_AUTH_SUBJECT;
    else process.env.API_DEV_AUTH_SUBJECT = previousSubject;
    if (previousTenant === undefined) delete process.env.API_DEV_TENANT_ID;
    else process.env.API_DEV_TENANT_ID = previousTenant;
  }
});
