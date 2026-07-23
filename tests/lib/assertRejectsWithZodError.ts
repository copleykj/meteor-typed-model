import { assert } from "chai";
import { z } from "zod";

// chai's constructor matching (via check-error) only accepts constructors that
// derive from the built-in Error, and zod 4's ZodError intentionally does not
// extend Error. That makes `assert.isRejected(promise, z.ZodError)` impossible
// to satisfy on zod 4. Assert with the instanceof operator instead, which zod
// supports across the board via Symbol.hasInstance.
export default async function assertRejectsWithZodError(
  promise: Promise<unknown>,
): Promise<void> {
  try {
    await promise;
  } catch (e) {
    assert.instanceOf(e, z.ZodError as any);
    return;
  }
  assert.fail("expected promise to be rejected with a ZodError");
}
