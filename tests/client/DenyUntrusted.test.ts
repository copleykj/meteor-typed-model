import { Meteor } from "meteor/meteor";
import { assert } from "chai";
import { z } from "zod";
import { CustomTypes } from "meteor/typed:model";
import {
  ManualProtected,
  Timestamped,
  UserTracked,
  Common,
  Nested,
  Numeric,
  NumericSchema,
} from "../lib/clientTestModels";

const { nonEmptyString, denyUntrusted } = CustomTypes;

describe("Client-side denyUntrusted protection", function () {
  // Clean up after each test to avoid interference
  this.afterEach(async function () {
    // Client can only remove documents by ID, so we'll fetch all IDs first
    // and remove them one by one, or just skip cleanup on client
    // since test collections are disposable
  });

  describe("Basic insert protection", function () {
    it("prevents client from setting manually protected field on insert", async function () {
      try {
        await ManualProtected.collection.insertAsync({
          name: "Test User",
          email: "test@example.com",
          isAdmin: true, // Protected field!
        });
        assert.fail("Should have thrown untrusted-field-modification error");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "isAdmin");
        assert.include(error.reason, "client code");
      }
    });

    it("allows client insert when protected fields omitted", async function () {
      // The main test is that this insert succeeds without providing protected fields
      const id = await ManualProtected.collection.insertAsync({
        name: "Valid User",
        email: "valid@example.com",
        // isAdmin omitted - will use default (false) on server
        // role omitted - will use default ("user") on server
      });

      assert.isString(id);
      // Note: We don't verify default values here because client-side tests
      // can't reliably check server-side populated defaults. That's tested in server tests.
    });

    it("prevents setting multiple protected fields on insert", async function () {
      try {
        await ManualProtected.collection.insertAsync({
          name: "Hacker",
          email: "hacker@example.com",
          isAdmin: true, // Protected!
          role: "admin", // Protected!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        // Should mention at least one of the protected fields
        assert.ok(
          error.reason.includes("isAdmin") || error.reason.includes("role"),
        );
      }
    });

    it("prevents setting protected array field on insert", async function () {
      try {
        await ManualProtected.collection.insertAsync({
          name: "User",
          email: "user@example.com",
          permissions: ["admin"], // Protected array!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "permissions");
      }
    });

    it("prevents setting nested protected field on insert", async function () {
      try {
        await Nested.collection.insertAsync({
          name: "Test",
          metadata: {
            internal: true, // Protected nested field!
            score: 100,
          },
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "metadata.internal");
      }
    });
  });

  describe("Basic update protection", function () {
    it("prevents client from updating manually protected field", async function () {
      // First insert a document
      const id = await ManualProtected.collection.insertAsync({
        name: "Test User",
        email: "test@example.com",
      });

      // Try to update protected field
      try {
        await ManualProtected.collection.updateAsync(id, {
          $set: { isAdmin: true }, // Protected!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "isAdmin");
      }
    });

    it("allows client to update non-protected fields", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test User",
        email: "test@example.com",
      });

      // Update non-protected field should work
      const result = await ManualProtected.collection.updateAsync(id, {
        $set: { name: "Updated Name" },
      });

      assert.equal(result, 1);

      const doc = await ManualProtected.collection.findOneAsync(id);
      assert.equal(doc?.name, "Updated Name");
    });

    it("prevents updating multiple protected fields", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test User",
        email: "test@example.com",
      });

      try {
        await ManualProtected.collection.updateAsync(id, {
          $set: {
            isAdmin: true, // Protected!
            role: "admin", // Protected!
          },
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
      }
    });

    it("prevents updating nested protected field", async function () {
      const id = await Nested.collection.insertAsync({
        name: "Test",
      });

      try {
        await Nested.collection.updateAsync(id, {
          $set: { "metadata.internal": true }, // Protected nested field!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "metadata.internal");
      }
    });

    it("allows updating nested non-protected field", async function () {
      const id = await Nested.collection.insertAsync({
        name: "Test",
      });

      // Update non-protected nested field should work
      const result = await Nested.collection.updateAsync(id, {
        $set: { "metadata.score": 50 },
      });

      assert.equal(result, 1);

      const doc = await Nested.collection.findOneAsync(id);
      assert.equal(doc?.metadata.score, 50);
    });
  });

  describe("MongoDB operator protection", function () {
    it("prevents $push to protected array field", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test User",
        email: "test@example.com",
      });

      try {
        await ManualProtected.collection.updateAsync(id, {
          $push: { permissions: "admin" }, // Protected array!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "permissions");
      }
    });

    it("prevents $addToSet on protected array field", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test User",
        email: "test@example.com",
      });

      try {
        await ManualProtected.collection.updateAsync(id, {
          $addToSet: { permissions: "moderator" }, // Protected array!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "permissions");
      }
    });

    it("prevents $unset of protected field", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test User",
        email: "test@example.com",
      });

      try {
        await ManualProtected.collection.updateAsync(id, {
          $unset: { role: "" }, // Protected field!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "role");
      }
    });

    it("prevents $inc on protected numeric field", async function () {
      const id = await Numeric.collection.insertAsync({
        name: "Player",
      });

      try {
        await Numeric.collection.updateAsync(id, {
          $inc: { level: 10 }, // Protected field!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "level");
      }
    });
  });

  describe("Schema helper auto-protection", function () {
    it("withTimestamps: prevents setting createdAt", async function () {
      try {
        await Timestamped.collection.insertAsync({
          name: "Test",
          createdAt: new Date(), // Protected by withTimestamps!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "createdAt");
      }
    });

    it("withTimestamps: prevents updating updatedAt", async function () {
      const id = await Timestamped.collection.insertAsync({
        name: "Test",
      });

      try {
        await Timestamped.collection.updateAsync(id, {
          $set: { updatedAt: new Date() }, // Protected by withTimestamps!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "updatedAt");
      }
    });

    it("withTimestamps: allows insert when timestamps omitted", async function () {
      // The main test is that this succeeds - timestamps are auto-populated server-side
      const id = await Timestamped.collection.insertAsync({
        name: "Test",
        // createdAt/updatedAt omitted - will be auto-populated on server
      });

      assert.isString(id);
      // Note: Server-side auto-populated fields may not sync back immediately to client
      // That functionality is tested in server-side tests
    });

    it("withUsers: prevents setting createdBy", async function () {
      try {
        await UserTracked.collection.insertAsync({
          name: "Test",
          createdBy: "fake-user-id", // Protected by withUsers!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "createdBy");
      }
    });

    it("withUsers: prevents updating updatedBy", async function () {
      const id = await UserTracked.collection.insertAsync({
        name: "Test",
      });

      try {
        await UserTracked.collection.updateAsync(id, {
          $set: { updatedBy: "fake-user-id" }, // Protected by withUsers!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "updatedBy");
      }
    });

    it("withCommon: protects all four fields (timestamps + users)", async function () {
      // Try to set createdAt
      try {
        await Common.collection.insertAsync({
          title: "Test",
          createdAt: new Date(), // Protected!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
      }

      // Try to set createdBy
      try {
        await Common.collection.insertAsync({
          title: "Test",
          createdBy: "fake-user", // Protected!
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
      }
    });

    it("withCommon: allows insert when all protected fields omitted", async function () {
      // The main test is that this succeeds - all protected fields are auto-populated server-side
      const id = await Common.collection.insertAsync({
        title: "Test",
        // All protected fields omitted - will be auto-populated on server
      });

      assert.isString(id);
      // Note: Server-side auto-populated fields may not sync back immediately to client
      // That functionality is tested in server-side tests
    });
  });

  describe("Mixed protected and non-protected fields", function () {
    it("allows updating mix of fields when only non-protected modified", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test",
        email: "test@example.com",
      });

      // Update multiple non-protected fields
      const result = await ManualProtected.collection.updateAsync(id, {
        $set: {
          name: "Updated",
          email: "updated@example.com",
        },
      });

      assert.equal(result, 1);

      const doc = await ManualProtected.collection.findOneAsync(id);
      assert.equal(doc?.name, "Updated");
      assert.equal(doc?.email, "updated@example.com");
    });

    it("denies update when mix includes protected field", async function () {
      const id = await ManualProtected.collection.insertAsync({
        name: "Test",
        email: "test@example.com",
      });

      try {
        await ManualProtected.collection.updateAsync(id, {
          $set: {
            name: "Updated", // OK
            email: "updated@example.com", // OK
            isAdmin: true, // Protected - should deny entire operation!
          },
        });
        assert.fail("Should have been denied");
      } catch (error: any) {
        assert.equal(error.error, "untrusted-field-modification");
        assert.include(error.reason, "isAdmin");
      }

      // Verify nothing was updated (entire operation denied)
      const doc = await ManualProtected.collection.findOneAsync(id);
      assert.equal(doc?.name, "Test"); // Should still be original value
    });
  });
});
