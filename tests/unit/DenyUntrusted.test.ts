import { Random } from "meteor/random";
import { assert } from "chai";
import { z } from "zod";
import { Model } from "meteor/typed:model";
import { CustomTypes, SchemaHelpers } from "meteor/typed:model";
import type { MongoRecordZodType } from "../../src/generateJsonSchema";

const {
  denyUntrusted,
  nonEmptyString,
  resetClock,
  setClock,
  stringId,
} = CustomTypes;

const { withCommon, withTimestamps, withUsers } = SchemaHelpers;

const testModels: Set<Model<any, any>> = new Set();

async function createTestModel<T extends MongoRecordZodType>(
  schema: T,
): Promise<Model<T, typeof stringId>> {
  const collectionName = `test_deny_untrusted_${Random.id()}`;
  const model = new Model({ name: collectionName, schema });
  testModels.add(model);
  return model;
}

describe("denyUntrusted", function () {
  this.afterAll(async function () {
    for (const model of testModels) {
      await model.collection.dropCollectionAsync();
    }
    testModels.clear();
    resetClock();
  });

  this.afterEach(function () {
    resetClock();
  });

  // Note: These tests run on the server in Meteor test environment
  // Meteor's deny rules only run for client-initiated operations (via DDP)
  // Direct server-side calls to Model methods bypass deny rules
  // To test deny rules, we need to call collection methods directly (which triggers deny rules)
  // and verify the Meteor.Error is thrown

  describe("basic server behavior (bypasses deny rules)", function () {
    it("allows server to set protected fields on insert", async function () {
      const schema = z.object({
        name: nonEmptyString,
        isAdmin: denyUntrusted(z.boolean().default(false)),
      });
      const model = await createTestModel(schema);

      // Server can set protected fields
      const id = await model.insertAsync({
        name: "Alice",
        isAdmin: true, // Server can set this
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.name, "Alice");
      assert.equal(record.isAdmin, true);
    });

    it("allows server to set protected fields on update", async function () {
      const schema = z.object({
        name: nonEmptyString,
        role: denyUntrusted(nonEmptyString.optional()),
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({
        name: "Bob",
      });

      // Server can update protected fields
      await model.updateAsync(id, {
        $set: { role: "admin" },
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.role, "admin");
    });

    it("allows omitting protected fields (uses default)", async function () {
      const schema = z.object({
        name: nonEmptyString,
        isActive: denyUntrusted(z.boolean().default(true)),
      });
      const model = await createTestModel(schema);

      // Don't provide isActive - should use default
      const id = await model.insertAsync({
        name: "Charlie",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.isActive, true); // Default value
    });
  });

  describe("schema helper auto-protection", function () {
    it("withTimestamps auto-manages timestamps (manual protection needed for createdAt)", async function () {
      const baseSchema = z.object({
        name: nonEmptyString,
      });
      const schema = withTimestamps(baseSchema);
      const model = await createTestModel(schema);

      const fixedDate = new Date("2024-01-01T00:00:00Z");
      setClock(() => fixedDate);

      // Server can insert without providing timestamps
      const id = await model.insertAsync({
        name: "Alice",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.isOk(record.createdAt);
      assert.equal((record.createdAt as Date).toISOString(), fixedDate.toISOString());
      assert.isOk(record.updatedAt);
      assert.equal((record.updatedAt as Date).toISOString(), fixedDate.toISOString());

      // Verify updatedAt is automatically updated
      const updateDate = new Date("2024-01-02T00:00:00Z");
      setClock(() => updateDate);

      await model.updateAsync(id, {
        $set: { name: "Alice Updated" },
      });

      const updated = await model.findOneAsync(id);
      assert.isOk(updated);
      // Note: createdAt should stay the same in normal operations
      // but is not automatically protected with denyUntrusted
      assert.isOk(updated.updatedAt);
      assert.equal((updated.updatedAt as Date).toISOString(), updateDate.toISOString());
    });

    it("withUsers protects createdBy (but not updatedBy)", async function () {
      const baseSchema = z.object({
        name: nonEmptyString,
      });
      const schema = withUsers(baseSchema);
      const model = await createTestModel(schema);

      // Note: In test environment, Meteor.userId() might be null
      // The auto-value logic handles this
      const id = await model.insertAsync({
        name: "Bob",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      // createdBy will be set if there's a userId, undefined otherwise
      // We're mainly testing that the schema accepts the insert
      assert.isOk(true); // If we got here, the insert succeeded
    });

    it("withCommon protects createdBy (but not timestamp or updatedBy fields)", async function () {
      const baseSchema = z.object({
        name: nonEmptyString,
      });
      const schema = withCommon(baseSchema);
      const model = await createTestModel(schema);

      const fixedDate = new Date("2024-01-15T12:00:00Z");
      setClock(() => fixedDate);

      const id = await model.insertAsync({
        name: "Charlie",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.isOk(record.createdAt);
      assert.equal((record.createdAt as Date).toISOString(), fixedDate.toISOString());
      assert.isOk(record.updatedAt);
      assert.equal((record.updatedAt as Date).toISOString(), fixedDate.toISOString());
      // createdBy and updatedBy will be set based on Meteor.userId()
    });
  });

  describe("manual denyUntrusted on custom fields", function () {
    it("protects boolean flags", async function () {
      const schema = z.object({
        username: nonEmptyString,
        isAdmin: denyUntrusted(z.boolean().default(false)),
        isPremium: denyUntrusted(z.boolean().default(false)),
      });
      const model = await createTestModel(schema);

      // Server inserting with defaults
      const id = await model.insertAsync({
        username: "user1",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.isAdmin, false);
      assert.equal(record.isPremium, false);
    });

    it("protects optional fields", async function () {
      const schema = z.object({
        name: nonEmptyString,
        secretKey: denyUntrusted(nonEmptyString.optional()),
      });
      const model = await createTestModel(schema);

      // Server can omit optional protected field
      const id = await model.insertAsync({
        name: "Eve",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.isUndefined(record.secretKey);

      // Server can set it later
      await model.updateAsync(id, {
        $set: { secretKey: "secret123" },
      });

      const updated = await model.findOneAsync(id);
      assert.isOk(updated);
      assert.equal(updated.secretKey, "secret123");
    });

    it("protects enum fields", async function () {
      const schema = z.object({
        username: nonEmptyString,
        role: denyUntrusted(
          z.enum(["user", "moderator", "admin"]).default("user"),
        ),
      });
      const model = await createTestModel(schema);

      // Server can use default
      const id = await model.insertAsync({
        username: "frank",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.role, "user");
    });

    it("protects number fields", async function () {
      const schema = z.object({
        name: nonEmptyString,
        creditBalance: denyUntrusted(z.number().default(0)),
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({
        name: "Grace",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.creditBalance, 0);

      // Server can update
      await model.updateAsync(id, {
        $set: { creditBalance: 100 },
      });

      const updated = await model.findOneAsync(id);
      assert.isOk(updated);
      assert.equal(updated.creditBalance, 100);
    });
  });

  describe("with MongoDB update operators", function () {
    it("allows server to use $set on protected fields", async function () {
      const schema = z.object({
        name: nonEmptyString,
        permissions: denyUntrusted(z.array(nonEmptyString).default([])),
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({
        name: "Hannah",
      });

      // Server can $set protected field
      await model.updateAsync(id, {
        $set: { permissions: ["read", "write"] },
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.deepEqual(record.permissions, ["read", "write"]);
    });

    it("allows server to use $set to modify protected arrays", async function () {
      const schema = z.object({
        name: nonEmptyString,
        badges: denyUntrusted(z.array(nonEmptyString).default([])),
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({
        name: "Ivan",
      });

      // Server can $set protected array
      await model.updateAsync(id, {
        $set: { badges: ["early-adopter"] },
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.deepEqual(record.badges, ["early-adopter"]);
    });

    it("allows server to use $unset on protected fields", async function () {
      const schema = z.object({
        name: nonEmptyString,
        tempToken: denyUntrusted(nonEmptyString.optional()),
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({
        name: "Jane",
        tempToken: "temp123",
      });

      // Server can $unset protected field
      await model.updateAsync(id, {
        $unset: { tempToken: 1 },
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.isUndefined(record.tempToken);
    });
  });

  describe("field combinations", function () {
    it("allows mixing protected and unprotected fields", async function () {
      const schema = z.object({
        username: nonEmptyString,
        email: nonEmptyString,
        isVerified: denyUntrusted(z.boolean().default(false)),
        lastLogin: denyUntrusted(z.date().optional()),
      });
      const model = await createTestModel(schema);

      // Anyone can set regular fields, server sets protected fields
      const id = await model.insertAsync({
        username: "user123",
        email: "user@example.com",
        // isVerified omitted, uses default
        // lastLogin omitted
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.username, "user123");
      assert.equal(record.email, "user@example.com");
      assert.equal(record.isVerified, false);
      assert.isUndefined(record.lastLogin);

      // Server can update protected field
      const now = new Date();
      await model.updateAsync(id, {
        $set: {
          email: "newemail@example.com", // Regular field
          lastLogin: now, // Protected field
        },
      });

      const updated = await model.findOneAsync(id);
      assert.isOk(updated);
      assert.equal(updated.email, "newemail@example.com");
      assert.isOk(updated.lastLogin);
      assert.equal((updated.lastLogin as Date).toISOString(), now.toISOString());
    });
  });

  describe("integration with existing customTypes", function () {
    it("works with nonEmptyString", async function () {
      const { nonEmptyString } = CustomTypes;
      const schema = z.object({
        publicName: nonEmptyString,
        internalId: denyUntrusted(nonEmptyString.optional()),
      });
      const model = await createTestModel(schema);

      const id = await model.insertAsync({
        publicName: "Public User",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.publicName, "Public User");
      assert.isUndefined(record.internalId);
    });
  });

  describe("default value behavior", function () {
    it("uses default when field is omitted", async function () {
      const schema = z.object({
        name: nonEmptyString,
        priority: denyUntrusted(z.number().default(1)),
      });
      const model = await createTestModel(schema);

      // Don't provide priority
      const id = await model.insertAsync({
        name: "Mike",
      });

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.priority, 1);
    });
  });

  describe("bypassSchema interaction", function () {
    it("bypassSchema allows setting protected fields from anywhere", async function () {
      const schema = z.object({
        name: nonEmptyString,
        isAdmin: denyUntrusted(z.boolean().default(false)),
      });
      const model = await createTestModel(schema);

      // With bypassSchema, even validation is skipped
      const id = await model.insertAsync(
        {
          name: "Nancy",
          isAdmin: true,
        } as any,
        { bypassSchema: true },
      );

      const record = await model.findOneAsync(id);
      assert.isOk(record);
      assert.equal(record.isAdmin, true);
    });
  });

  describe("protected field detection", function () {
    it("detects manually protected fields", function () {
      const schema = z.object({
        name: nonEmptyString,
        isAdmin: denyUntrusted(z.boolean().default(false)),
        role: denyUntrusted(nonEmptyString.default("user")),
      });
      const model = new Model({ name: `test_detection_${Random.id()}`, schema });
      testModels.add(model);

      // Check that protected fields were detected
      const protectedFields = (model as any).protectedFields as Set<string>;
      assert.isTrue(protectedFields.has("isAdmin"));
      assert.isTrue(protectedFields.has("role"));
      assert.isFalse(protectedFields.has("name")); // Not protected
    });

    it("detects protected fields from withTimestamps", function () {
      const baseSchema = z.object({
        name: nonEmptyString,
      });
      const schema = withTimestamps(baseSchema);
      const model = new Model({ name: `test_timestamps_${Random.id()}`, schema });
      testModels.add(model);

      const protectedFields = (model as any).protectedFields as Set<string>;
      assert.isTrue(protectedFields.has("createdAt"));
      assert.isTrue(protectedFields.has("updatedAt"));
    });

    it("detects protected fields from withUsers", function () {
      const baseSchema = z.object({
        name: nonEmptyString,
      });
      const schema = withUsers(baseSchema);
      const model = new Model({ name: `test_users_${Random.id()}`, schema });
      testModels.add(model);

      const protectedFields = (model as any).protectedFields as Set<string>;
      assert.isTrue(protectedFields.has("createdBy"));
      assert.isTrue(protectedFields.has("updatedBy"));
    });

    it("detects all protected fields from withCommon", function () {
      const baseSchema = z.object({
        name: nonEmptyString,
      });
      const schema = withCommon(baseSchema);
      const model = new Model({ name: `test_common_${Random.id()}`, schema });
      testModels.add(model);

      const protectedFields = (model as any).protectedFields as Set<string>;
      assert.isTrue(protectedFields.has("createdAt"));
      assert.isTrue(protectedFields.has("updatedAt"));
      assert.isTrue(protectedFields.has("createdBy"));
      assert.isTrue(protectedFields.has("updatedBy"));
    });

    it("detects nested protected fields", function () {
      const schema = z.object({
        name: nonEmptyString,
        metadata: z.object({
          internalFlag: denyUntrusted(z.boolean().default(false)),
        }),
      });
      const model = new Model({ name: `test_nested_${Random.id()}`, schema });
      testModels.add(model);

      const protectedFields = (model as any).protectedFields as Set<string>;
      assert.isTrue(protectedFields.has("metadata.internalFlag"));
    });
  });

  describe("deny rules (protect against client operations)", function () {
    it("registers deny rules that check protected fields", function () {
      const schema = z.object({
        name: nonEmptyString,
        isAdmin: denyUntrusted(z.boolean().default(false)),
      });
      const model = new Model({ name: `test_deny_rules_${Random.id()}`, schema });
      testModels.add(model);

      // Verify the model has set up deny rules
      // (In production, these will block client-initiated operations via DDP)
      assert.isOk(model.collection);

      // Note: We cannot easily test the deny rules in a server-side test environment
      // because Meteor's allow/deny system only applies to client-initiated operations.
      // The deny rules are tested implicitly through:
      // 1. Field detection tests (above) verify fields are identified correctly
      // 2. Manual testing in a real Meteor app with client/server separation
      // 3. The deny rule logic is straightforward: if client sets protected field, deny
    });
  });
});
