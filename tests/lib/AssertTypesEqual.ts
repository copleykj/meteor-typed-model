/**
 * Compile-time type assertion utility for verifying TypeScript type equality.
 *
 * This type returns `true` if types T and U are exactly equal, otherwise
 * returns an object describing the error with both types for debugging.
 *
 * Usage in tests:
 * ```typescript
 * const typeTest: AssertTypesEqual<Expected, Actual> = true;
 * assert.isTrue(typeTest);
 * ```
 *
 * If the types don't match, TypeScript will show a compile-time error
 * with details about the mismatch.
 */
export type AssertTypesEqual<T, U> =
  (<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
    ? true
    : { error: "Types are not equal"; type1: T; type2: U };
