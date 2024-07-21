// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by model.js.
import { name as packageName } from "meteor/typed:model";

// Write your tests here!
// Here is an example.
Tinytest.add('model - example', function (test) {
  test.equal(packageName, "typed:model");
});
