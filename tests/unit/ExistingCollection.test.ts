import { Meteor } from "meteor/meteor";
import type { Mongo } from "meteor/mongo";
import { Random } from "meteor/random";
import { assert } from "chai";
import { z } from "zod";
import { Model, ModelType } from "meteor/typed:model";
import { CustomTypes } from "meteor/typed:model";
import type { AssertTypesEqual } from "../lib/AssertTypesEqual";

const { nonEmptyString } = CustomTypes;

// Regression tests for GitHub issue #1 ("how to extends meteor.users?"):
// wrapping an existing collection whose TypeScript type is independent of the
// schema. Meteor.users is Mongo.Collection<Meteor.User>, which is never
// assignable to Mongo.Collection<z.output<Schema>> (the generic is invariant),
// so the constructor's collection parameter must accept Mongo.Collection<any>.
describe("wrapping existing collections (issue #1)", function () {
  // Mirrors the README's "Working With Existing Collections" example. Note
  // nonEmptyString: a bare z.string() would violate the package's empty-string
  // policy and make Model construction throw.
  const UserSchema = z.object({
    username: nonEmptyString.optional(),
    emails: z
      .array(
        z.object({
          address: z.string().email(),
          verified: z.boolean(),
        }),
      )
      .optional(),
    createdAt: z.date().optional(),
    profile: z.record(z.string(), z.unknown()).optional(),
    services: z.record(z.string(), z.unknown()).optional(),
  });

  let UserModel: Model<typeof UserSchema>;
  const insertedIds: string[] = [];

  this.beforeAll(function () {
    // The point of the regression test: this must compile without casting
    // Meteor.users, and construct without throwing
    UserModel = new Model({
      name: "users",
      schema: UserSchema,
      collection: Meteor.users,
    });
  });

  this.afterAll(async function () {
    for (const id of insertedIds) {
      try {
        await UserModel.removeAsync(id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it("wraps Meteor.users rather than creating a new collection", function () {
    assert.strictEqual(
      UserModel.collection as Mongo.Collection<any>,
      Meteor.users as Mongo.Collection<any>,
    );
  });

  it("performs schema-validated writes against the wrapped collection", async function () {
    const username = `typed_model_test_${Random.id()}`;
    const id = await UserModel.insertAsync({
      username,
      createdAt: new Date(),
    });
    insertedIds.push(id);
    assert.isString(id);

    const user = await UserModel.findOneAsync(id);
    assert.isOk(user);
    assert.equal(user!.username, username);

    // The document is really in Meteor.users
    const raw = await Meteor.users.findOneAsync(id);
    assert.equal(raw?.username, username);
  });

  it("rejects writes that violate the schema", async function () {
    try {
      await UserModel.insertAsync({
        username: "", // violates nonEmptyString
      });
      assert.fail("expected a validation error");
    } catch (e) {
      assert.instanceOf(e, z.ZodError as any);
    }
  });

  it("infers document types from the schema, not from Meteor.User", function () {
    type UserDoc = ModelType<typeof UserModel>;
    const usernameTypeTest: AssertTypesEqual<
      UserDoc["username"],
      string | undefined
    > = true;
    assert.isTrue(usernameTypeTest);
    const idTypeTest: AssertTypesEqual<UserDoc["_id"], string> = true;
    assert.isTrue(idTypeTest);
  });
});
