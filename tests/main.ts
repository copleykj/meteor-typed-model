import { Meteor } from "meteor/meteor";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

// Extend Chai with chai-as-promised for async assertions
chai.use(chaiAsPromised);

// Import shared test models (runs on both client and server)
import "./lib/clientTestModels";

// Import server-side test suites
if (Meteor.isServer) {
  import "./unit/Model.test";
  import "./unit/generateJsonSchema.test";
  import "./unit/validateSchema.test";
  import "./unit/AllowDeny.test";
  import "./unit/DenyUntrusted.test";
}

// Import client-side test suites
if (Meteor.isClient) {
  import "./client/basic.test";
  import "./client/DenyUntrusted.test";
}
