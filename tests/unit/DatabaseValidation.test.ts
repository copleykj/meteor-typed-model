import { Meteor } from "meteor/meteor";
import { Random } from "meteor/random";
import { assert } from "chai";
import { z } from "zod";
import { Model } from "../../src/model";
import { CustomTypes } from "../../exports";
import assertRejectsWithZodError from "../lib/assertRejectsWithZodError";

const { stringId, nonEmptyString } = CustomTypes;

const testModels: Set<Model<any, any>> = new Set();

describe("Database-Level Validation", function () {
  this.timeout(10000);

  this.afterAll(async function () {
    // Clean up test collections
    for (const model of testModels) {
      try {
        await model.collection.dropCollectionAsync();
      } catch (e) {
        // Ignore errors (collection might not exist)
      }
    }
    testModels.clear();
  });

  describe("Opt-in behavior", function () {
    it("should NOT attach validator by default", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        name: nonEmptyString,
      });

      const collectionName = `test_no_validator_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        // attachValidator not specified - defaults to false
      });
      testModels.add(model);

      // Insert a document to ensure collection exists
      await model.insertAsync({ name: "test" });

      // Check if validator exists by trying to insert an invalid document
      // directly. With no validator attached, MongoDB accepts it.
      await assert.isFulfilled(
        model.collection.rawCollection().insertOne({
          _id: Random.id(),
          name: "", // Invalid: empty string
        }),
        "Validator should not be attached by default"
      );
    });

    it("should attach validator when attachValidator: true", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        name: nonEmptyString.min(1),
      });

      const collectionName = `test_with_validator_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // Wait for validator to attach by doing a CRUD operation
      const id = await model.insertAsync({ name: "test" });
      assert.isString(id);

      // Now try to insert invalid document directly through rawCollection
      // This should fail because MongoDB validator is attached
      try {
        await model.collection.rawCollection().insertOne({
          _id: Random.id(),
          name: "", // Invalid: empty string
        });
        assert.fail(
          "Expected MongoDB to reject invalid document, but it was accepted"
        );
      } catch (e: any) {
        // This is expected - MongoDB rejected the document
        assert.include(
          e.message.toLowerCase(),
          "validation",
          "Error should mention validation failure"
        );
      }
    });
  });

  describe("Collection creation scenarios", function () {
    it("should attach validator on new collection", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        value: z.number().int().min(0),
      });

      const collectionName = `test_new_collection_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // Insert valid document
      await model.insertAsync({ value: 42 });

      // Try invalid document through raw collection
      await assert.isRejected(
        model.collection.rawCollection().insertOne({
          _id: Random.id(),
          value: -1, // Invalid: negative number
        }),
        /validation/i,
        "Validator should reject a negative value"
      );
    });

    it("should attach validator to existing collection (collMod path)", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        email: z.string().email(),
      });

      const collectionName = `test_existing_${Random.id()}`;

      // Create collection without validator first
      const modelWithoutValidator = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: false,
      });
      testModels.add(modelWithoutValidator);

      await modelWithoutValidator.insertAsync({ email: "test@example.com" });

      // Now create a new model with validator enabled (should use collMod)
      const modelWithValidator = new Model({
        name: collectionName,
        schema: TestSchema,
        collection: modelWithoutValidator.collection,
        attachValidator: true,
      });

      // Wait for validator to attach
      await modelWithValidator.insertAsync({ email: "another@example.com" });

      // Try invalid document
      await assert.isRejected(
        modelWithValidator.collection.rawCollection().insertOne({
          _id: Random.id(),
          email: "not-an-email", // Invalid email format
        }),
        /validation/i,
        "Validator should have been attached via collMod"
      );
    });
  });

  describe("Validation behavior", function () {
    it("should not include internal marker field in database when validators attached", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        name: nonEmptyString,
      });

      const collectionName = `test_no_marker_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // Insert via Model method
      const id = await model.insertAsync({ name: "test" });

      // Read directly from MongoDB to inspect actual stored document
      const doc = await model.collection.rawCollection().findOne({ _id: id });

      // Verify marker is NOT in the actual database document
      assert.notProperty(
        doc,
        "_meteortypedmodelTrusted",
        "Internal marker should not be present in database when validators are attached"
      );

      // Verify only expected fields are present
      assert.hasAllKeys(doc, ["_id", "name"], "Document should only have schema-defined fields");
    });

    it("should not include internal marker field in database when validators NOT attached", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        name: nonEmptyString,
      });

      const collectionName = `test_marker_cleaned_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: false, // Validators NOT attached
      });
      testModels.add(model);

      // Insert via Model method
      const id = await model.insertAsync({ name: "test" });

      // Read directly from MongoDB to inspect actual stored document
      const doc = await model.collection.rawCollection().findOne({ _id: id });

      // Deny rules only run for client-initiated writes, so server-side inserts
      // must not add the marker in the first place -- nothing would strip it.
      assert.notProperty(
        doc,
        "_meteortypedmodelTrusted",
        "Internal marker should never be added by server-side writes"
      );

      // Verify only expected fields are present
      assert.hasAllKeys(doc, ["_id", "name"], "Document should only have schema-defined fields");
    });

    it("should not include internal marker field after update or upsert", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        name: nonEmptyString,
      });

      const collectionName = `test_marker_modifiers_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: false,
      });
      testModels.add(model);

      const id = await model.insertAsync({ name: "original" });

      await model.updateAsync(id, { $set: { name: "updated" } });
      const updated = await model.collection.rawCollection().findOne({ _id: id });
      assert.notProperty(
        updated,
        "_meteortypedmodelTrusted",
        "updateAsync should not persist the internal marker"
      );
      assert.hasAllKeys(updated, ["_id", "name"]);

      const upsertId = Random.id();
      await model.upsertAsync(upsertId, { $set: { name: "upserted" } });
      const upserted = await model.collection
        .rawCollection()
        .findOne({ _id: upsertId });
      assert.notProperty(
        upserted,
        "_meteortypedmodelTrusted",
        "upsertAsync should not persist the internal marker"
      );
      assert.hasAllKeys(upserted, ["_id", "name"]);
    });

    it("should reject invalid documents at database level", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        age: z.number().int().min(0).max(150),
      });

      const collectionName = `test_db_validation_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      await model.insertAsync({ age: 25 });

      // Try invalid value through raw collection (bypasses Model validation)
      try {
        await model.collection.rawCollection().insertOne({
          _id: Random.id(),
          age: 200, // Invalid: exceeds max
        });
        assert.fail("Expected database validation to reject");
      } catch (e: any) {
        assert.include(e.message.toLowerCase(), "validation");
      }
    });

    it("should accept valid documents at database level", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        status: z.enum(["active", "inactive"]),
      });

      const collectionName = `test_valid_docs_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // Insert through Model
      const id1 = await model.insertAsync({ status: "active" });
      assert.isString(id1);

      // Insert directly through raw collection
      const id2 = Random.id();
      await model.collection.rawCollection().insertOne({
        _id: id2,
        status: "inactive",
      });
      assert.isString(id2);
    });

    it("should bypass validation with bypassSchema option", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        required: nonEmptyString,
      });

      const collectionName = `test_bypass_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      await model.insertAsync({ required: "valid" });

      // Insert invalid document with bypassSchema
      const id = await model.insertAsync(
        { required: "" } as any, // Invalid: empty string
        { bypassSchema: true }
      );
      assert.isString(id, "bypassSchema should allow invalid document");

      // Confirm it actually landed in MongoDB with the invalid value, i.e. the
      // database validator was bypassed too, not just the Zod layer.
      const doc = await model.collection.rawCollection().findOne({ _id: id });
      assert.strictEqual(
        doc?.required,
        "",
        "Invalid value should be persisted when both layers are bypassed"
      );
    });
  });

  describe("Race condition prevention", function () {
    it("should wait for validator attachment before CRUD operations", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        data: nonEmptyString,
      });

      const collectionName = `test_race_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // Immediately perform CRUD operation (should wait for validator)
      const id = await model.insertAsync({ data: "test" });
      assert.isString(id);

      // Verify validator is attached by trying invalid insert
      await assert.isRejected(
        model.collection.rawCollection().insertOne({
          _id: Random.id(),
          data: "",
        }),
        /validation/i,
        "Validator should have been attached before the CRUD operation resolved"
      );
    });
  });

  describe("Error handling", function () {
    it("should surface validator attachment failures on the first CRUD operation", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      // A schema that validateSchema() accepts but generateJsonSchema() cannot
      // convert: regex flags have no MongoDB JSON Schema equivalent.
      const UnconvertibleSchema = z.object({
        _id: stringId,
        code: z.string().regex(/^[a-z]+$/i),
      });

      const collectionName = `test_invalid_schema_${Random.id()}`;

      // Construction must not throw -- attachment is asynchronous, and a
      // constructor cannot await it.
      const model = new Model({
        name: collectionName,
        schema: UnconvertibleSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // The failure is re-thrown by the first operation that awaits attachment.
      await assert.isRejected(
        model.insertAsync({ code: "abc" }),
        /Regex flags are not supported/,
        "Attachment failure should surface on the first CRUD operation"
      );

      // ...and on every subsequent operation, not just the first.
      await assert.isRejected(
        model.insertAsync({ code: "def" }),
        /Regex flags are not supported/,
        "Attachment failure should keep surfacing"
      );
    });
  });

  describe("Multi-layer validation", function () {
    it("should validate at both application and database layers", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        count: z.number().int().positive(),
      });

      const collectionName = `test_multi_layer_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      // Layer 1: Application validation (Zod) - should reject first
      // Application layer should reject with a ZodError
      await assertRejectsWithZodError(model.insertAsync({ count: -5 } as any));

      // Insert valid document
      await model.insertAsync({ count: 5 });

      // Layer 2: Database validation - bypassing Model methods
      try {
        await model.collection.rawCollection().insertOne({
          _id: Random.id(),
          count: -10,
        });
        assert.fail("Expected database validation to reject");
      } catch (e: any) {
        // MongoDB validation error
        assert.include(e.message.toLowerCase(), "validation");
      }
    });
  });

  describe("Update operations", function () {
    it("should validate updates at database level", async function () {
      if (Meteor.isClient) {
        this.skip();
        return;
      }

      const TestSchema = z.object({
        _id: stringId,
        price: z.number().min(0),
      });

      const collectionName = `test_update_validation_${Random.id()}`;
      const model = new Model({
        name: collectionName,
        schema: TestSchema,
        attachValidator: true,
      });
      testModels.add(model);

      const id = await model.insertAsync({ price: 10.0 });

      // Try invalid update through raw collection
      try {
        await model.collection.rawCollection().updateOne(
          { _id: id },
          { $set: { price: -5 } } // Invalid: negative price
        );
        assert.fail("Expected database to reject invalid update");
      } catch (e: any) {
        assert.include(e.message.toLowerCase(), "validation");
      }
    });
  });
});
