import type { Hono } from "hono";
import { getAdministrationApi } from "@/config/dependencies";
import { authorizeTenantRequest, createApiExecutionContext } from "@/api/request-security";
import { Permissions } from "@/server/auth/permissions";
import { arraySchema, booleanSchema, enumSchema, numberSchema, objectSchema, optionalSchema, stringSchema, type RuntimeSchema } from "@/shared/contracts/runtime-schema";
import type { CreateTenantUserInput, UpdateTenantUserInput } from "@/modules/users/application/manage-users";
import type { CreateDiscountPolicyInput } from "@/modules/commercial-policy/application/create-discount-policy";

const text = (max = 500) => stringSchema({ min: 1, max, trim: true });
const optionalText = (max = 500): RuntimeSchema<string | undefined> => ({
  parse(value, path = "$") {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return text(max).parse(value, path);
  },
});

const userCreateSchema = objectSchema({
  fullName: text(160),
  email: text(254),
  phone: optionalText(40),
  profile: enumSchema(["administrator", "reception", "professional"] as const),
  status: optionalSchema(enumSchema(["active", "inactive"] as const)),
});

const userUpdateSchema = objectSchema({
  fullName: optionalText(160),
  phone: optionalText(40),
  profile: optionalSchema(enumSchema(["administrator", "reception", "professional"] as const)),
  status: optionalSchema(enumSchema(["active", "inactive"] as const)),
});

const discountPolicyCreateSchema = objectSchema({
  name: text(160),
  profile: enumSchema(["new", "returning", "loyal", "inactive", "frequent_no_show"] as const),
  type: enumSchema(["percentage", "fixed", "restriction"] as const),
  percentage: optionalSchema(numberSchema({ min: 0, max: 100 })),
  fixedAmountCents: optionalSchema(numberSchema({ integer: true, min: 0 })),
  eligibleServiceIds: optionalSchema(arraySchema(text(128), { max: 100 })),
  eligibleCategories: optionalSchema(arraySchema(text(120), { max: 100 })),
  minimumAmountCents: optionalSchema(numberSchema({ integer: true, min: 0 })),
  maximumDiscountCents: optionalSchema(numberSchema({ integer: true, min: 0 })),
  validFrom: optionalText(50),
  validUntil: optionalText(50),
  singleUse: optionalSchema(booleanSchema()),
  requiresApproval: optionalSchema(booleanSchema()),
  stackable: optionalSchema(booleanSchema()),
});

export function registerAdministrationRoutes(app: Hono) {
  app.get("/v1/users", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.UserManage);
    return c.json(await getAdministrationApi().listUsers(createApiExecutionContext(c.req.raw, "user.list", tenantId, actorId)));
  });

  app.post("/v1/users", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.UserManage);
    const input = userCreateSchema.parse(await c.req.json()) as CreateTenantUserInput;
    return c.json(await getAdministrationApi().createUser(createApiExecutionContext(c.req.raw, "user.create", tenantId, actorId), input), 201);
  });

  app.put("/v1/users/:userId", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.UserManage);
    const input = userUpdateSchema.parse(await c.req.json()) as UpdateTenantUserInput;
    return c.json(await getAdministrationApi().updateUser(createApiExecutionContext(c.req.raw, "user.update", tenantId, actorId), c.req.param("userId"), input));
  });

  app.get("/v1/relationship-profile-configs", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.CommercialPolicyRead);
    return c.json(await getAdministrationApi().listRelationshipProfileConfigs(createApiExecutionContext(c.req.raw, "commercial-profile-config.list", tenantId, actorId)));
  });

  app.get("/v1/discount-policies", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.CommercialPolicyRead);
    return c.json(await getAdministrationApi().listDiscountPolicies(createApiExecutionContext(c.req.raw, "discount-policy.list", tenantId, actorId)));
  });

  app.post("/v1/discount-policies", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.CommercialPolicyManage);
    const input = discountPolicyCreateSchema.parse(await c.req.json()) as CreateDiscountPolicyInput;
    return c.json(await getAdministrationApi().createDiscountPolicy(createApiExecutionContext(c.req.raw, "discount-policy.create", tenantId, actorId), input), 201);
  });

  app.get("/v1/discount-approvals", async (c) => {
    const { tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.CommercialPolicyRead);
    return c.json(await getAdministrationApi().listDiscountApprovals(createApiExecutionContext(c.req.raw, "discount-approval.list", tenantId, actorId)));
  });
}
