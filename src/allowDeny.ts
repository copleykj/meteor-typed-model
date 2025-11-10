import { Meteor } from "meteor/meteor";
import type { z } from "zod";

/**
 * Allow/Deny rule callback for insert operations
 * @param userId - The ID of the user attempting the operation (null if not logged in)
 * @param doc - The document being inserted
 * @returns true to allow/deny the operation, false otherwise
 */
export type InsertRule<T> = (userId: string | null, doc: T) => boolean;

/**
 * Allow/Deny rule callback for update operations
 * @param userId - The ID of the user attempting the operation (null if not logged in)
 * @param doc - The current document in the database
 * @param fieldNames - Array of top-level field names being modified
 * @param modifier - The MongoDB modifier object (e.g., {$set: {...}})
 * @returns true to allow/deny the operation, false otherwise
 */
export type UpdateRule<T> = (
  userId: string | null,
  doc: T,
  fieldNames: string[],
  modifier: Record<string, any>,
) => boolean;

/**
 * Allow/Deny rule callback for remove operations
 * @param userId - The ID of the user attempting the operation (null if not logged in)
 * @param doc - The document being removed
 * @returns true to allow/deny the operation, false otherwise
 */
export type RemoveRule<T> = (userId: string | null, doc: T) => boolean;

/**
 * Options for allow rules
 * Allow rules permit client-side database operations when they return true.
 * At least one allow rule must return true for an operation to succeed.
 */
export interface AllowRules<T> {
  /** Allow insert operations */
  insert?: InsertRule<T>;
  /** Allow update operations */
  update?: UpdateRule<T>;
  /** Allow remove operations */
  remove?: RemoveRule<T>;
  /**
   * Array of field names to fetch from the database for update/remove operations.
   * These fields will be available in the doc parameter of update/remove callbacks.
   * If not specified, only the _id field is fetched.
   */
  fetch?: string[];
  /**
   * Function to transform documents before passing to callbacks.
   * Overrides any transform on the Collection.
   */
  transform?: ((doc: any) => T) | null;
}

/**
 * Options for deny rules
 * Deny rules block client-side database operations when they return true.
 * If any deny rule returns true, the operation is rejected.
 */
export interface DenyRules<T> {
  /** Deny insert operations */
  insert?: InsertRule<T>;
  /** Deny update operations */
  update?: UpdateRule<T>;
  /** Deny remove operations */
  remove?: RemoveRule<T>;
  /**
   * Array of field names to fetch from the database for update/remove operations.
   * These fields will be available in the doc parameter of update/remove callbacks.
   * If not specified, only the _id field is fetched.
   */
  fetch?: string[];
  /**
   * Function to transform documents before passing to callbacks.
   * Overrides any transform on the Collection.
   */
  transform?: ((doc: any) => T) | null;
}

/**
 * Formats a Zod validation error as a Meteor.Error
 * @param error - The Zod validation error
 * @param operation - The operation that failed (insert, update, etc.)
 * @returns A Meteor.Error with details about the validation failure
 */
export function formatValidationErrorForClient(
  error: z.ZodError,
  operation: "insert" | "update" | "remove",
): Meteor.Error {
  const details = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));

  return new Meteor.Error(
    "validation-error",
    `Document failed validation for ${operation}`,
    JSON.stringify({ issues: details }),
  );
}

/**
 * Extracts field names from a MongoDB modifier object
 * @param modifier - MongoDB modifier object (e.g., {$set: {name: "John"}, $inc: {count: 1}})
 * @returns Array of top-level field names being modified
 */
export function extractFieldNamesFromModifier(
  modifier: Record<string, any>,
): string[] {
  const fields = new Set<string>();

  for (const operator in modifier) {
    if (typeof modifier[operator] === "object" && modifier[operator] !== null) {
      for (const field in modifier[operator]) {
        // Extract top-level field name (before first dot)
        const topLevelField = field.split(".")[0];
        if (topLevelField) {
          fields.add(topLevelField);
        }
      }
    }
  }

  return Array.from(fields);
}

/**
 * Checks if the insecure package is loaded
 * The insecure package allows all client-side database operations by default
 */
export function isInsecureMode(): boolean {
  // Check if Package.insecure exists
  // @ts-ignore - Package is a global Meteor object not defined in types
  return !!Package?.insecure;
}
