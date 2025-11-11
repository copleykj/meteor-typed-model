import { Meteor } from "meteor/meteor";
import { z } from "zod";
import { attachCustomJsonSchema } from "./generateJsonSchema";
import { Id } from "./regexes";

// Each of these is set to true based on the context in which the schema is
// being evaluated. They are mutually exclusive (although they can all be false)
//
// As a note: IsUpdate is set to true when generating $set operations on any
// update (upsert or not).
export const IsInsert = new Meteor.EnvironmentVariable<boolean>();
export const IsUpdate = new Meteor.EnvironmentVariable<boolean>();
export const IsUpsert = new Meteor.EnvironmentVariable<boolean>();

// Set to true when Model methods are adding protected field defaults as part of
// trusted transformation (not client directly setting protected fields)
export const IsTrustedTransform = new Meteor.EnvironmentVariable<boolean>();

// Allow overriding time for testing
let clock: () => Date;
export function setClock(newClock: () => Date) {
  clock = newClock;
}
export function resetClock() {
  clock = () => new Date();
}
resetClock();

export const nonEmptyString = z.string().min(1);

// There's nothing special about this specific string schema, but
// `validateSchema` compares string fields against it by reference to determine
// whether it should explicitly whitelist a field as being allowed to be empty.
export const allowedEmptyString = z.string();

// In several of these auto-generated fields, we lie to zod about the output
// type of the field - with type assertions, we say that they are non-nullable.
// This will be true in the database, even though the transform functions don't
// always return values (e.g. createdTimestamp will always be a Date, it'll just
// get set on insertion and not on subsequent updates).

export const stringId = z
  .string()
  .regex(Id)
  .optional()
  .transform((v) => v as unknown as string);
attachCustomJsonSchema(
  stringId,
  { bsonType: "string", pattern: Id.source },
  true,
);

export const foreignKey = z.string().regex(Id);

export const snowflake = z.string().regex(/^[0-9]+$/);

// It would be nice if we could encode this in generateJsonSchema instead of
// requiring a custom type, but z.instanceof just returns a generic ZodType
// rather than something we can easily introspect (like one of the
// ZodFirstPartySchemaTypes).
export const uint8Array = z.instanceof(Uint8Array);
attachCustomJsonSchema(uint8Array, { bsonType: "binData" });

export const portNumber = z.number().int().positive().lte(65535);

export const deleted = z.boolean().default(false);

export const createdTimestamp = z.date().default(() => clock());
attachCustomJsonSchema(createdTimestamp, { bsonType: "date" }, true);

export const updatedTimestamp = z
  .date()
  .optional()
  .transform((v) => {
    if (v) return v;
    if (
      IsInsert.getOrNullIfOutsideFiber() ||
      IsUpsert.getOrNullIfOutsideFiber() ||
      IsUpdate.getOrNullIfOutsideFiber()
    ) {
      return clock();
    }
    return undefined as unknown as Date;
  });
attachCustomJsonSchema(updatedTimestamp, { bsonType: "date" });

export const createdUser = foreignKey.optional().transform((v) => {
  if (v) return v;
  try {
    if (IsInsert.get() || IsUpsert.get()) return Meteor.userId()!;
  } catch (e) {
    /* ignore */
  }
  return undefined as unknown as string;
});
attachCustomJsonSchema(
  createdUser,
  { bsonType: "string", pattern: Id.source },
  true,
);

export const updatedUser = foreignKey.optional().transform((v) => {
  if (v) return v;
  try {
    if (IsUpdate.get()) return Meteor.userId() ?? undefined;
  } catch (e) {
    /* ignore */
  }
  return undefined;
});
attachCustomJsonSchema(updatedUser, { bsonType: "string", pattern: Id.source });

// Symbol used to mark schemas as protected from untrusted modifications
const DENY_UNTRUSTED_MARKER = Symbol("denyUntrusted");

/**
 * Marks a Zod schema field as protected from untrusted (client) code modifications.
 *
 * This is similar to collection2/simple-schema's `denyUntrusted` custom validator.
 * Fields marked with this function can only be modified by server-side code.
 * Client attempts to set these fields will be denied via Meteor's deny() system.
 *
 * Behavior:
 * - Server (trusted) code: Can set any value
 * - Client (untrusted) code:
 *   - Cannot set the field (operation will be denied)
 *   - Can omit the field (will use default or auto-generated value)
 *
 * Protection is enforced at the Model/Collection level via Meteor's deny() rules,
 * working even if the underlying collection is accessed directly (not through Model methods).
 *
 * Typical use cases:
 * - System-managed fields (timestamps, user IDs) that should never be client-settable
 * - Security-sensitive fields (isAdmin, role, permissions)
 * - Audit fields that must reflect actual operation context
 *
 * @example
 * ```typescript
 * const UserSchema = z.object({
 *   _id: stringId,
 *   username: nonEmptyString,
 *   isAdmin: denyUntrusted(z.boolean().default(false)),
 *   roleId: denyUntrusted(nonEmptyString.optional()),
 *   createdAt: denyUntrusted(createdTimestamp),
 *   updatedAt: denyUntrusted(updatedTimestamp),
 * });
 * ```
 *
 * @param schema - Any Zod schema to protect from untrusted modifications
 * @returns The same schema with metadata marking it as protected
 */
export function denyUntrusted<T extends z.ZodTypeAny>(schema: T): T {
  // Add marker symbol to the schema for detection by Model
  (schema as any)[DENY_UNTRUSTED_MARKER] = true;
  return schema;
}

/**
 * Checks if a Zod schema has been marked with denyUntrusted
 * @internal
 */
export function isDenyUntrusted(schema: z.ZodTypeAny): boolean {
  return !!(schema as any)[DENY_UNTRUSTED_MARKER];
}

