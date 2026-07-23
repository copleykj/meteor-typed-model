/* eslint-disable @typescript-eslint/no-use-before-define */
import type { Mongo } from "meteor/mongo";
import { z } from "zod";
import { Email, URL, UUID } from "./regexes";

// This file is heavily inspired by zod-to-json-schema, but we use our own
// version because (a) zod-to-json-schema supports a different version of
// json-schema than MongoDB (b) we wanted support for custom schema declarations

export type MongoRecordZodType =
  | z.ZodObject<any, any>
  | z.ZodUnion<any>
  | z.ZodDiscriminatedUnion<any, any>
  | z.ZodIntersection<any, any>
  | z.ZodRecord<any, any>;

// The discriminated union of zod 4 internal defs. Switching on `def.type`
// narrows to the specific def shape.
type AnyDef = z.core.$ZodTypes["_zod"]["def"];

// A zod 4 check's internal def. Discriminated by `check`.
type AnyCheckDef = z.core.$ZodChecks["_zod"]["def"];

function defOf(schema: z.core.$ZodType): AnyDef {
  return (schema as z.core.$ZodTypes)._zod.def;
}

// Collect the check defs on a schema. String/number format schemas (z.email(),
// z.int(), ...) are their own check: the def carries `check`/`format` keys
// directly, and may or may not also list itself in `def.checks`, so we
// de-duplicate by identity.
function checkDefsOf(def: AnyDef): AnyCheckDef[] {
  const checks = ("checks" in def ? def.checks ?? [] : []).map(
    (c) => (c as z.core.$ZodChecks)._zod.def,
  );
  if ("check" in def && !checks.includes(def as unknown as AnyCheckDef)) {
    checks.unshift(def as unknown as AnyCheckDef);
  }
  return checks;
}

export interface JsonSchema {
  bsonType?: Mongo.BsonType & string;
  enum?: readonly any[];
  allOf?: readonly JsonSchema[];
  anyOf?: readonly JsonSchema[];
  not?: JsonSchema;

  // string
  pattern?: string;
  minLength?: number;
  maxLength?: number;

  // number
  minimum?: number;
  exclusiveMinimum?: boolean;
  maximum?: number;
  exclusiveMaximum?: boolean;
  multipleOf?: number;

  // array/tuple
  items?: JsonSchema | readonly JsonSchema[];
  additionalItems?: boolean | JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // object
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  required?: readonly string[];
}

function formatCheckToPattern(check: z.core.$ZodCheckStringFormatDef): RegExp {
  // For the formats we historically supported, keep using our own regexes so
  // the generated schemas stay stable; fall back to the pattern zod itself
  // uses for any other format that provides one.
  switch (check.format) {
    case "regex":
      if (!check.pattern) {
        throw new Error("Regex check has no pattern");
      }
      return check.pattern;
    case "email":
      return Email;
    case "uuid":
    case "guid":
      return UUID;
    case "url":
      return URL;
    default:
      if (check.pattern instanceof RegExp) {
        return check.pattern;
      }
      throw new Error(`Unsupported string check: ${check.format}`);
  }
}

function stringToSchema(def: AnyDef & { type: "string" }): JsonSchema {
  const bsonType = "string";

  const constraints = checkDefsOf(def).reduce<Partial<JsonSchema>>(
    (acc, check) => {
      switch (check.check) {
        case "min_length":
          return {
            ...acc,
            minLength: acc.minLength
              ? Math.max(acc.minLength, check.minimum as number)
              : (check.minimum as number),
          };
        case "max_length":
          return {
            ...acc,
            maxLength: acc.maxLength
              ? Math.min(acc.maxLength, check.maximum as number)
              : (check.maximum as number),
          };
        case "length_equals":
          return {
            ...acc,
            minLength: acc.minLength
              ? Math.max(acc.minLength, check.length as number)
              : (check.length as number),
            maxLength: acc.maxLength
              ? Math.min(acc.maxLength, check.length as number)
              : (check.length as number),
          };
        case "string_format": {
          const pattern = formatCheckToPattern(
            check as z.core.$ZodCheckStringFormatDef,
          );
          if (pattern.flags !== "") {
            throw new Error("Regex flags are not supported");
          }

          return {
            ...acc,
            ...(acc.pattern
              ? {
                  allOf: [...(acc.allOf ?? []), { pattern: pattern.source }],
                }
              : { pattern: pattern.source }),
          };
        }
        default:
          throw new Error(`Unsupported string check: ${check.check}`);
      }
    },
    {},
  );

  return {
    bsonType,
    ...constraints,
  };
}

function numberToSchema(def: AnyDef & { type: "number" }): JsonSchema {
  const constraints = checkDefsOf(def).reduce<Partial<JsonSchema>>(
    (acc, check) => {
      switch (check.check) {
        case "number_format": {
          const { format } = check as z.core.$ZodCheckNumberFormatDef;
          if (!/int/.test(format)) {
            // float32/float64 don't restrict the bson type
            return acc;
          }
          return {
            ...acc,
            bsonType: "int",
          };
        }
        case "greater_than": {
          const { value, inclusive } = check as z.core.$ZodCheckGreaterThanDef;
          let min;
          let exclusive;
          if ((value as number) > (acc.minimum ?? -Infinity)) {
            min = value as number;
            exclusive = !inclusive;
          } else if (value === acc.minimum) {
            min = value as number;
            exclusive = acc.exclusiveMinimum! || !inclusive;
          } else {
            min = acc.minimum;
            exclusive = acc.exclusiveMinimum;
          }
          return {
            ...acc,
            minimum: min,
            exclusiveMinimum: exclusive,
          };
        }
        case "less_than": {
          const { value, inclusive } = check as z.core.$ZodCheckLessThanDef;
          let max;
          let exclusive;
          if ((value as number) < (acc.maximum ?? Infinity)) {
            max = value as number;
            exclusive = !inclusive;
          } else if (value === acc.maximum) {
            max = value as number;
            exclusive = acc.exclusiveMaximum! || !inclusive;
          } else {
            max = acc.maximum;
            exclusive = acc.exclusiveMaximum;
          }
          return {
            ...acc,
            maximum: max,
            exclusiveMaximum: exclusive,
          };
        }
        case "multiple_of": {
          const { value } = check as z.core.$ZodCheckMultipleOfDef;
          return {
            ...acc,
            ...(acc.multipleOf
              ? {
                  allOf: [
                    ...(acc.allOf ?? []),
                    { multipleOf: value as number },
                  ],
                }
              : { multipleOf: value as number }),
          };
        }
        default:
          throw new Error(`Unsupported number check: ${check.check}`);
      }
    },
    {},
  );

  return {
    // Default to accepting any numeric type, but this will be overwritten by
    // constraints if an int was specifically requested
    bsonType: "number",
    ...constraints,
  };
}

function dateToSchema(def: AnyDef & { type: "date" }): JsonSchema {
  if (checkDefsOf(def).length > 0) {
    throw new Error("Date schema checks are not supported");
  }

  return {
    bsonType: "date",
  };
}

function literalToSchema(def: z.core.$ZodLiteralDef<any>): JsonSchema {
  return {
    enum: [...def.values],
  };
}

function arrayToSchema(def: z.core.$ZodArrayDef<any>): JsonSchema {
  let minItems: number | undefined;
  let maxItems: number | undefined;
  for (const check of checkDefsOf(def as AnyDef)) {
    switch (check.check) {
      case "min_length":
        minItems = Math.max(minItems ?? 0, check.minimum as number);
        break;
      case "max_length":
        maxItems = Math.min(maxItems ?? Infinity, check.maximum as number);
        break;
      case "length_equals":
        minItems = Math.max(minItems ?? 0, check.length as number);
        maxItems = Math.min(maxItems ?? Infinity, check.length as number);
        break;
      default:
        throw new Error(`Unsupported array check: ${check.check}`);
    }
  }
  return {
    bsonType: "array",
    items: schemaToJsonSchema(def.element as z.ZodType),
    ...(minItems ? { minItems } : {}),
    ...(maxItems !== undefined && maxItems !== Infinity ? { maxItems } : {}),
  };
}

// A zod 4 object's treatment of unknown keys lives in its catchall: absent
// (strip) or ZodNever (strict) reject/ignore unknown keys, ZodUnknown/ZodAny
// (loose/passthrough) accept them, and any other schema validates them.
function catchallOf(def: z.core.$ZodObjectDef): z.core.$ZodType | undefined {
  const { catchall } = def;
  if (!catchall || defOf(catchall).type === "never") {
    return undefined;
  }
  return catchall;
}

function objectToSchema(
  def: z.core.$ZodObjectDef,
  allowedKeys: Set<string>,
  catchall: boolean,
): JsonSchema {
  let additionalProperties: JsonSchema["additionalProperties"];
  const catchallSchema = catchallOf(def);
  if (catchall) {
    additionalProperties = true;
  } else if (catchallSchema) {
    const catchallType = defOf(catchallSchema).type;
    additionalProperties =
      catchallType === "unknown" || catchallType === "any"
        ? true
        : schemaToJsonSchema(catchallSchema as z.ZodType);
  } else {
    additionalProperties = false;
  }

  const inheritedProperties: Record<string, JsonSchema> = Object.fromEntries(
    [...allowedKeys].map((key) => [key, {}]),
  );
  const properties = Object.entries(def.shape).reduce<
    Record<string, JsonSchema>
  >((acc, [key, value]) => {
    acc[key] = schemaToJsonSchema(value as z.ZodType);
    return acc;
  }, inheritedProperties);
  const required = Object.entries(def.shape)
    .filter(([_, value]) => {
      return (
        !(value as z.ZodType).safeParse(undefined).success ||
        ("customJsonSchemaRequired" in value &&
          (value as any).customJsonSchemaRequired)
      );
    })
    .map(([key]) => key);

  const schema: JsonSchema = {
    bsonType: "object",
    properties,
    required,
    additionalProperties,
  };

  if (schema.required?.length === 0) {
    delete schema.required;
  }

  return schema;
}

// Covers both z.union and z.discriminatedUnion - Mongo can't do anything
// special with a discriminated union anyway.
function unionToSchema(
  def: z.core.$ZodUnionDef,
  allowedKeys: Set<string>,
  catchall: boolean,
): JsonSchema {
  return {
    anyOf: def.options.map((option) =>
      schemaToJsonSchema(option as z.ZodType, allowedKeys, catchall),
    ),
  };
}

// Return anything that could potentially be a valid object on one half of an
// intersection - we'll make sure it's allowed on the other half
function potentialObjectKeys(
  schema: z.core.$ZodType,
): [keys: Set<string>, catchall: boolean] {
  const def = defOf(schema);
  switch (def.type) {
    case "string":
    case "number":
    case "date":
    case "boolean":
    case "null":
    case "any":
    case "unknown":
    case "never":
    case "array":
    case "tuple":
    case "enum":
    case "literal":
    case "custom":
      return [new Set(), false];
    case "object":
      return [new Set(Object.keys(def.shape)), !!catchallOf(def)];
    case "record":
      return [new Set(), true];
    case "union":
      return def.options.reduce<[keys: Set<string>, catchall: boolean]>(
        ([keys, catchall], option) => {
          const [optionKeys, optionCatchall] = potentialObjectKeys(option);
          return [
            new Set([...keys, ...optionKeys]),
            catchall || optionCatchall,
          ];
        },
        [new Set(), false],
      );
    case "intersection": {
      const [leftKeys, leftCatchall] = potentialObjectKeys(def.left);
      const [rightKeys, rightCatchall] = potentialObjectKeys(def.right);
      return [
        new Set([...leftKeys, ...rightKeys]),
        leftCatchall || rightCatchall,
      ];
    }
    case "pipe":
      return potentialObjectKeys(def.in);
    case "optional":
    case "nullable":
    case "default":
      return potentialObjectKeys(def.innerType);
    default:
      throw new Error(`Unexpected schema type: ${def.type}`);
  }
}

function intersectionToSchema(
  def: z.core.$ZodIntersectionDef,
  allowedKeys: Set<string>,
  catchall: boolean,
): JsonSchema {
  const [leftKeys, leftCatchall] = potentialObjectKeys(def.left);
  const [rightKeys, rightCatchall] = potentialObjectKeys(def.right);

  return {
    allOf: [
      schemaToJsonSchema(
        def.left as z.ZodType,
        new Set([...rightKeys, ...allowedKeys]),
        rightCatchall || catchall,
      ),
      schemaToJsonSchema(
        def.right as z.ZodType,
        new Set([...leftKeys, ...allowedKeys]),
        leftCatchall || catchall,
      ),
    ],
  };
}

function tupleToSchema(def: z.core.$ZodTupleDef): JsonSchema {
  return {
    bsonType: "array",
    items: def.items.map((item) => schemaToJsonSchema(item as z.ZodType)),
    additionalItems: def.rest ? schemaToJsonSchema(def.rest as z.ZodType) : false,
  };
}

function recordToSchema(def: z.core.$ZodRecordDef): JsonSchema {
  const keyDef = defOf(def.keyType);
  if (keyDef.type !== "string") {
    throw new Error("Record key type must be string");
  }

  if (checkDefsOf(keyDef).length > 0) {
    throw new Error("Record key type checks are not supported");
  }

  return {
    bsonType: "object",
    additionalProperties: schemaToJsonSchema(def.valueType as z.ZodType),
  };
}

// Covers both z.enum and z.nativeEnum (which produces a ZodEnum in zod 4)
function enumToSchema(def: z.core.$ZodEnumDef): JsonSchema {
  return {
    enum: Object.values(def.entries),
  };
}

// When used in an object, an optional type allows the key to be absent. (And we
// handle that constraint as part of handling objects.) However on its own, an
// optional type just means that the value can be undefined. That's not very
// useful with json-schema or Mongo, neither of which can represent undefined.
// So just return the inner type to keep our schema simpler.
function optionalToSchema(
  def: z.core.$ZodOptionalDef<any>,
  allowedKeys: Set<string>,
  catchall: boolean,
): JsonSchema {
  return schemaToJsonSchema(def.innerType, allowedKeys, catchall);
}

function nullableToSchema(
  def: z.core.$ZodNullableDef<any>,
  allowedKeys: Set<string>,
  catchall: boolean,
): JsonSchema {
  if ((def.innerType as z.ZodType).safeParse(null).success) {
    return schemaToJsonSchema(def.innerType, allowedKeys, catchall);
  }

  return {
    anyOf: [
      { bsonType: "null" },
      schemaToJsonSchema(def.innerType, allowedKeys, catchall),
    ],
  };
}

// This should be the not-nullable version of the inner type, since the default
// must match the inner type.
function defaultToSchema(
  def: z.core.$ZodDefaultDef<any>,
  allowedKeys: Set<string>,
  catchall: boolean,
): JsonSchema {
  return {
    allOf: [
      { not: { bsonType: "null" } },
      schemaToJsonSchema(def.innerType, allowedKeys, catchall),
    ],
  };
}

// The allowedKeys and catchall parameters exist for the benefit of intersection
// types, since the semantics of a TypeScript intersection and json-schema's
// allOf are not the same. With TypeScript, intersecting two types allows
// properties which are defined on one but not the other, whereas with
// json-schema, if one branch of an allOf rejects a property, the whole schema
// is rejected.
//
// To work around that, we need to detect if one side of an intersection is
// object-like, and push the properties it allows into the other side.
export function schemaToJsonSchema<T extends z.core.$ZodType>(
  schema: T,
  allowedKeys: Set<string> = new Set(),
  catchall = false,
): JsonSchema {
  if ("customJsonSchema" in schema && schema.customJsonSchema) {
    return schema.customJsonSchema as JsonSchema;
  }

  const def = defOf(schema);
  switch (def.type) {
    // scalars
    case "string":
      return stringToSchema(def);
    case "number":
      return numberToSchema(def);
    case "date":
      return dateToSchema(def);
    case "literal":
      return literalToSchema(def);
    case "boolean":
      return { bsonType: "bool" };
    case "null":
      return { bsonType: "null" };
    // Treat "unknown" as any. They have different meanings at the type layer,
    // but at the database layer, they're equivalent
    case "unknown":
    case "any":
      return {};

    // collections
    case "array":
      return arrayToSchema(def);
    case "object":
      return objectToSchema(def, allowedKeys, catchall);
    case "union":
      return unionToSchema(def, allowedKeys, catchall);
    case "intersection":
      return intersectionToSchema(def, allowedKeys, catchall);
    case "tuple":
      return tupleToSchema(def);
    case "record":
      return recordToSchema(def);
    case "enum":
      return enumToSchema(def);
    case "optional":
      return optionalToSchema(def, allowedKeys, catchall);
    case "nullable":
      return nullableToSchema(def, allowedKeys, catchall);
    case "default":
      return defaultToSchema(def, allowedKeys, catchall);
    default:
      throw new Error(
        `Unsupported schema type: ${def.type}; use customJsonSchema instead`,
      );
  }
}

export function attachCustomJsonSchema<T extends z.ZodType>(
  schema: T,
  customSchema: JsonSchema,
  required = false,
) {
  (schema as any).customJsonSchema = customSchema;
  (schema as any).customJsonSchemaRequired = required;
}

export default function generateJsonSchema<T extends MongoRecordZodType>(
  schema: T,
): JsonSchema {
  return schemaToJsonSchema(schema);
}
