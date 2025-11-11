/**
 * Shared test models for client-side denyUntrusted tests
 * This file runs on BOTH client and server to ensure collections are properly set up
 */

import { z } from "zod";
import { Model, CustomTypes, SchemaHelpers } from "meteor/typed:model";

const { nonEmptyString, denyUntrusted } = CustomTypes;
const { withTimestamps, withUsers, withCommon } = SchemaHelpers;

// Model with manually protected fields
export const ManualProtectedSchema = z.object({
  name: nonEmptyString,
  email: nonEmptyString,
  isAdmin: denyUntrusted(z.boolean().default(false)),
  role: denyUntrusted(nonEmptyString.default("user")),
  permissions: denyUntrusted(z.array(nonEmptyString).default([])),
});

export const ManualProtected = new Model({
  name: "test_manual_protected_client",
  schema: ManualProtectedSchema,
});

ManualProtected.allow({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

// Model with withTimestamps
export const TimestampedSchema = withTimestamps(
  z.object({
    name: nonEmptyString,
  }),
);

export const Timestamped = new Model({
  name: "test_timestamped_client",
  schema: TimestampedSchema,
});

Timestamped.allow({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

// Model with withUsers
export const UserTrackedSchema = withUsers(
  z.object({
    name: nonEmptyString,
  }),
);

export const UserTracked = new Model({
  name: "test_user_tracked_client",
  schema: UserTrackedSchema,
});

UserTracked.allow({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

// Model with withCommon (both timestamps and users)
export const CommonSchema = withCommon(
  z.object({
    title: nonEmptyString,
  }),
);

export const Common = new Model({
  name: "test_common_client",
  schema: CommonSchema,
});

Common.allow({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

// Model with nested protected fields
export const NestedSchema = z.object({
  name: nonEmptyString,
  metadata: z
    .object({
      internal: denyUntrusted(z.boolean().default(false)),
      score: z.number().default(0),
    })
    .default({ internal: false, score: 0 }),
});

export const Nested = new Model({
  name: "test_nested_client",
  schema: NestedSchema,
});

Nested.allow({
  insert: () => true,
  update: () => true,
  remove: () => true,
});

// Model for numeric field testing
export const NumericSchema = z.object({
  name: nonEmptyString,
  score: z.number().default(0),
  level: denyUntrusted(z.number().default(1)),
});

export const Numeric = new Model({
  name: "test_numeric_client",
  schema: NumericSchema,
});

Numeric.allow({
  insert: () => true,
  update: () => true,
  remove: () => true,
});
