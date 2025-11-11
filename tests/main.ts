import { Meteor } from "meteor/meteor";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

// Extend Chai with chai-as-promised for async assertions
chai.use(chaiAsPromised);

// Import shared test models (runs on both client and server)
import "./lib/clientTestModels";

// Import server-side test suites
if (Meteor.isServer) {
  (async () => {
    await import("./unit/Model.test");
    await import("./unit/generateJsonSchema.test");
    await import("./unit/validateSchema.test");
    await import("./unit/AllowDeny.test");
    await import("./unit/DenyUntrusted.test");
  })();
}

// Import client-side test suites
if (Meteor.isClient) {
  (async () => {
    await import("./client/basic.test");
    await import("./client/DenyUntrusted.test");
  })();
}
