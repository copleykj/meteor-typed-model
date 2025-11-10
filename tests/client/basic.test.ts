import { assert } from "chai";
import { Model, CustomTypes, SchemaHelpers } from "meteor/typed:model";
import { z } from "zod";

describe("Client-side package loading", function () {
  it("should load the Model class", function () {
    assert.isFunction(Model);
  });

  it("should expose CustomTypes", function () {
    assert.exists(CustomTypes);
    assert.property(CustomTypes, "nonEmptyString");
    assert.isFunction(CustomTypes.nonEmptyString.parse);
  });

  it("should expose SchemaHelpers", function () {
    assert.isObject(SchemaHelpers);
    assert.isFunction(SchemaHelpers.withCommon);
    assert.isFunction(SchemaHelpers.withTimestamps);
    assert.isFunction(SchemaHelpers.withUsers);
  });

  it("should be able to create a Model instance", function () {
    const schema = z.object({
      name: CustomTypes.nonEmptyString,
    });

    const model = new Model({
      name: "test_client_collection",
      schema,
    });

    assert.isObject(model);
    assert.equal(model.name, "test_client_collection");
    assert.isObject(model.collection);
  });
});
