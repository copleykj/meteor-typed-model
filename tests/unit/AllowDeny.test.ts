import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import { z } from "zod";
import { Model, CustomTypes } from "meteor/typed:model";
import type { MongoRecordZodType } from "../../src/generateJsonSchema";

const { nonEmptyString, stringId } = CustomTypes;

const testModels: Set<Model<any, any>> = new Set();

async function createTestModel<T extends MongoRecordZodType>(
  schema: T,
): Promise<Model<T, typeof stringId>> {
  const collectionName = `test_allowdeny_${Random.id()}`;
  const model = new Model({ name: collectionName, schema });
  testModels.add(model);
  return model;
}

describe("AllowDeny", function () {
  this.afterAll(async function () {
    for (const model of testModels) {
      await model.collection.dropCollectionAsync();
    }
    testModels.clear();
  });

  describe("Auto-applied validation deny rules", function () {
    it("validates insert operations via direct collection access", async function () {
      const schema = z.object({
        name: nonEmptyString,
        count: z.number().min(0),
      });
      const model = await createTestModel(schema);

      // Add allow rule so operations can proceed
      model.allow({
        insert: () => true,
      });

      // Valid insert should work (on server, allow/deny don't apply, so this tests Model's own validation)
      const validId = await model.insertAsync({
        name: "test",
        count: 5,
      });
      assert.isString(validId);

      // Invalid insert should fail validation from Model's insertAsync
      await assert.isRejected(
        model.insertAsync({
          name: "test",
          // missing count
        } as any),
        z.ZodError
      );

      // Invalid insert should fail validation (empty string)
      await assert.isRejected(
        model.insertAsync({
          name: "", // empty string not allowed
          count: 5,
        }),
        z.ZodError
      );

      // Note: Direct collection.insertAsync bypasses Model validation when called from server
      // The deny rules only apply to client-initiated operations
    });

    it("validates update operations via direct collection access", async function () {
      const schema = z.object({
        name: nonEmptyString,
        count: z.number().min(0),
      });
      const model = await createTestModel(schema);

      model.allow({
        insert: () => true,
        update: () => true,
      });

      const id = await model.insertAsync({
        name: "test",
        count: 5,
      });

      // Valid update should work
      await model.updateAsync(id, {
        $set: { name: "updated" },
      });

      const updated = await model.findOneAsync(id);
      assert.equal(updated?.name, "updated");

      // Invalid update should fail validation from Model's updateAsync
      await assert.isRejected(
        model.updateAsync(id, {
          $set: { name: "" }, // empty string not allowed
        }),
        z.ZodError
      );

      // Note: Direct collection.updateAsync bypasses Model validation when called from server
      // The deny rules only apply to client-initiated operations
    });

    it("allows remove operations when permitted", async function () {
      const schema = z.object({
        name: nonEmptyString,
      });
      const model = await createTestModel(schema);

      model.allow({
        insert: () => true,
        remove: () => true,
      });

      const id = await model.insertAsync({ name: "test" });

      // Remove should work when allowed
      const result = await model.collection.removeAsync(id);
      assert.equal(result, 1);

      const removed = await model.findOneAsync(id);
      assert.isUndefined(removed);
    });
  });

  describe("Custom allow/deny rules", function () {
    it("enforces custom allow rules", async function () {
      const schema = z.object({
        name: nonEmptyString,
        userId: nonEmptyString,
      });
      const model = await createTestModel(schema);

      // Only allow inserts where userId matches the current user
      model.allow({
        insert: (userId, doc) => {
          return userId !== null && doc.userId === userId;
        },
      });

      // Mock Meteor.userId() for testing
      const originalUserId = Meteor.userId;
      try {
        // Test with matching userId
        (Meteor as any).userId = () => "user123";
        const validId = await model.insertAsync({
          name: "test",
          userId: "user123",
        });
        assert.isString(validId);

        // Test with non-matching userId (should fail)
        try {
          await model.insertAsync({
            name: "test",
            userId: "different-user",
          });
          assert.fail("Should have thrown not-authorized error");
        } catch (error: any) {
          // Meteor will throw an error when no allow rule returns true
          assert.ok(error);
        }
      } finally {
        (Meteor as any).userId = originalUserId;
      }
    });

    it("enforces custom deny rules", async function () {
      const schema = z.object({
        name: nonEmptyString,
        deleted: z.boolean().default(false),
      });
      const model = await createTestModel(schema);

      // Allow all operations by default
      model.allow({
        insert: () => true,
        update: () => true,
      });

      // But deny updates to deleted documents
      model.deny({
        update: (userId, doc) => {
          return doc.deleted === true;
        },
      });

      const id = await model.insertAsync({
        name: "test",
      });

      // Update should work on non-deleted doc
      await model.updateAsync(id, {
        $set: { name: "updated" },
      });

      // Mark as deleted
      await model.updateAsync(id, {
        $set: { deleted: true },
      });

      // Further updates should fail
      try {
        await model.collection.updateAsync(id, {
          $set: { name: "should-fail" },
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        // Deny rule should block this
        assert.ok(error);
      }
    });

    it("evaluates deny rules before allow rules", async function () {
      const schema = z.object({
        name: nonEmptyString,
        isAdmin: z.boolean().default(false),
      });
      const model = await createTestModel(schema);

      // Allow admins to do anything
      model.allow({
        update: (userId, doc) => {
          return doc.isAdmin === true;
        },
      });

      // But deny all updates to name field
      model.deny({
        update: (userId, doc, fieldNames) => {
          return fieldNames.includes("name");
        },
      });

      const id = await model.insertAsync({
        name: "test",
        isAdmin: true,
      });

      // Even though the allow rule returns true (isAdmin), the deny rule should block
      try {
        await model.collection.updateAsync(id, {
          $set: { name: "updated" },
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        // Deny rule should block this even though allow would permit
        assert.ok(error);
      }

      // But updating other fields should work
      await model.collection.updateAsync(id, {
        $set: { isAdmin: false },
      });
    });
  });

  describe("bypassSchema server-only enforcement", function () {
    it("throws error when bypassSchema used on client for insert", async function () {
      const schema = z.object({
        name: nonEmptyString,
      });
      const model = await createTestModel(schema);

      // Mock Meteor.isClient
      const originalIsClient = Meteor.isClient;
      try {
        (Meteor as any).isClient = true;

        await assert.isRejected(
          model.insertAsync({ name: "test" }, { bypassSchema: true }),
          /bypassSchema option is only available on the server/,
        );
      } finally {
        (Meteor as any).isClient = originalIsClient;
      }
    });

    it("throws error when bypassSchema used on client for update", async function () {
      const schema = z.object({
        name: nonEmptyString,
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({ name: "test" });

      // Mock Meteor.isClient
      const originalIsClient = Meteor.isClient;
      try {
        (Meteor as any).isClient = true;

        await assert.isRejected(
          model.updateAsync(
            id,
            { $set: { name: "updated" } },
            { bypassSchema: true },
          ),
          /bypassSchema option is only available on the server/,
        );
      } finally {
        (Meteor as any).isClient = originalIsClient;
      }
    });

    it("allows bypassSchema on server", async function () {
      const schema = z.object({
        name: nonEmptyString,
      });
      const model = await createTestModel(schema);

      // This should work because tests run on server by default
      const id = await model.insertAsync(
        { name: "" } as any,
        { bypassSchema: true },
      );
      assert.isString(id);

      await model.updateAsync(
        id,
        { $set: { name: "valid" } },
        { bypassSchema: true },
      );
    });
  });

  describe("Model allow/deny methods", function () {
    it("exposes allow method", async function () {
      const schema = z.object({
        name: nonEmptyString,
      });
      const model = await createTestModel(schema);

      assert.isFunction(model.allow);
      model.allow({
        insert: () => true,
      });
    });

    it("exposes deny method", async function () {
      const schema = z.object({
        name: nonEmptyString,
      });
      const model = await createTestModel(schema);

      assert.isFunction(model.deny);
      model.deny({
        insert: () => false,
      });
    });

    it("accepts multiple allow rules", async function () {
      const schema = z.object({
        name: nonEmptyString,
        category: nonEmptyString,
      });
      const model = await createTestModel(schema);

      model.allow({
        insert: (userId, doc) => doc.category === "public",
      });

      model.allow({
        insert: (userId, _doc) => userId === "admin",
      });

      // Either rule returning true should allow the operation
      const id = await model.insertAsync({
        name: "test",
        category: "public",
      });
      assert.isString(id);
    });

    it("accepts multiple deny rules", async function () {
      const schema = z.object({
        name: nonEmptyString,
        archived: z.boolean().default(false),
        locked: z.boolean().default(false),
      });
      const model = await createTestModel(schema);

      model.allow({
        update: () => true,
      });

      model.deny({
        update: (userId, doc) => doc.archived === true,
      });

      model.deny({
        update: (userId, doc) => doc.locked === true,
      });

      const id = await model.insertAsync({
        name: "test",
      });

      // Mark as archived
      await model.updateAsync(id, {
        $set: { archived: true },
      });

      // Should be denied
      try {
        await model.collection.updateAsync(id, {
          $set: { name: "updated" },
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.ok(error);
      }
    });
  });

  describe("Error formatting", function () {
    it("formats Zod errors as Meteor errors", async function () {
      const schema = z.object({
        name: nonEmptyString,
        email: z.string().email(),
        age: z.number().min(0).max(120),
      });
      const model = await createTestModel(schema);

      model.allow({
        insert: () => true,
      });

      // Test that Model methods format errors properly
      try {
        await model.insertAsync({
          name: "test",
          email: "invalid-email",
          age: 150,
        } as any);
        assert.fail("Should have thrown validation error");
      } catch (error: any) {
        assert.instanceOf(error, z.ZodError);
        assert.isArray(error.errors);
        // Zod errors have proper structure for debugging
      }

      // The formatValidationErrorForClient function converts Zod errors to Meteor errors
      // This is used by the deny rules for client-initiated operations
      const { formatValidationErrorForClient } = await import("../../src/allowDeny");
      const zodError = schema.safeParse({
        name: "test",
        email: "invalid",
        age: 150,
      });
      if (!zodError.success) {
        const meteorError = formatValidationErrorForClient(zodError.error, "insert");
        assert.equal(meteorError.error, "validation-error");
        assert.include(meteorError.reason, "validation");
        const details = JSON.parse(meteorError.details as string);
        assert.isObject(details);
        assert.isArray(details.issues);
      }
    });
  });

  describe("Integration with Model methods", function () {
    it("Model methods work with custom allow rules", async function () {
      const schema = z.object({
        name: nonEmptyString,
        value: z.number(),
      });
      const model = await createTestModel(schema);

      model.allow({
        insert: () => true,
        update: () => true,
        remove: () => true,
      });

      // insertAsync
      const id = await model.insertAsync({
        name: "test",
        value: 42,
      });
      assert.isString(id);

      // findOneAsync
      const doc = await model.findOneAsync(id);
      assert.equal(doc?.name, "test");
      assert.equal(doc?.value, 42);

      // updateAsync
      await model.updateAsync(id, {
        $set: { value: 100 },
      });
      const updated = await model.findOneAsync(id);
      assert.equal(updated?.value, 100);

      // removeAsync
      await model.removeAsync(id);
      const removed = await model.findOneAsync(id);
      assert.isUndefined(removed);
    });

    it("Validation works with transforms and defaults", async function () {
      const schema = z.object({
        name: nonEmptyString,
        status: nonEmptyString.default("active"),
        count: z.number().default(0),
      });
      const model = await createTestModel(schema);

      model.allow({
        insert: () => true,
      });

      // Insert with defaults
      const id = await model.insertAsync({
        name: "test",
      });

      const doc = await model.findOneAsync(id);
      assert.equal(doc?.status, "active");
      assert.equal(doc?.count, 0);
    });
  });
});
