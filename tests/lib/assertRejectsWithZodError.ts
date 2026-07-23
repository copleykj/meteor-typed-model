import { assert } from "chai";
import { z } from "zod";

// Assert a promise rejects with a ZodError using the instanceof operator
// directly. chai's constructor matching (via check-error) only accepts
// constructors that derive from the built-in Error; zod 4's ZodError does not
// extend Error, so `assert.isRejected(promise, z.ZodError)` cannot be
// satisfied there. Using this helper on both release lines keeps the test
// files identical between the zod 3 (1.x) and zod 4 (2.x) branches.
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
