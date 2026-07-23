import { z } from "zod";
import { allowedEmptyString } from "./customTypes";

// The discriminated union of zod 4 internal defs. Switching on `def.type`
// narrows to the specific def shape.
type AnyDef = z.core.$ZodTypes["_zod"]["def"];

export default function validateSchema(
  schema: z.core.$ZodType,
  path: string[] = [],
) {
  const def = (schema as z.core.$ZodTypes)._zod.def as AnyDef;

  switch (def.type) {
    case "object":
      Object.entries(def.shape).forEach(([key, field]) =>
        validateSchema(field, [...path, key]),
      );
      if (def.catchall) {
        validateSchema(def.catchall, path);
      }
      break;
    case "array":
      validateSchema(def.element, [...path, "[]"]);
      break;
    // Covers both z.union and z.discriminatedUnion
    case "union":
      def.options.forEach((option) => validateSchema(option, path));
      break;
    case "intersection":
      validateSchema(def.left, path);
      validateSchema(def.right, path);
      break;
    case "tuple":
      def.items.forEach((item, idx) => {
        validateSchema(item, [...path, idx.toString()]);
      });
      if (def.rest) {
        validateSchema(def.rest, [...path, "[]"]);
      }
      break;
    case "record":
      validateSchema(def.valueType, [...path, "[]"]);
      break;

    case "default":
    case "prefault":
    case "nullable":
    case "optional":
    case "nonoptional":
    case "readonly":
    case "catch":
      validateSchema(def.innerType, path);
      break;
    // Transform chains (.transform()) are pipes; validate their input side
    case "pipe":
      validateSchema(def.in, path);
      break;
    case "lazy":
      validateSchema(def.getter(), path);
      break;

    // "custom" is z.instanceof()/z.custom(), and "transform" is the output
    // half of a .transform() pipe - nothing to walk in either
    case "enum":
    case "literal":
    case "number":
    case "date":
    case "boolean":
    case "never":
    case "any":
    case "unknown":
    case "custom":
    case "transform":
      // No validation needed
      break;

    case "string": {
      // String fields must not accept empty strings, unless they're
      // specifically allowedEmptyString
      if (schema === allowedEmptyString) break;

      const result = (schema as z.ZodType).safeParse("");
      if (result.success) {
        throw new Error(
          `String fields must not accept empty strings (${path.join(".")})`,
        );
      }
      break;
    }

    default:
      throw new Error(`Unknown schema type: ${def.type}`);
  }
}
