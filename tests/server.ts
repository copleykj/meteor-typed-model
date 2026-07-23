import chai from "chai";
import chaiAsPromised from "chai-as-promised";

// Extend Chai with chai-as-promised for async assertions
chai.use(chaiAsPromised);

// Shared test models (defined on both client and server)
import "./lib/clientTestModels";

// Server-side test suites. These are static imports so that every suite is
// registered before the test driver starts running -- dynamic import() resolves
// asynchronously and can lose the race against the runner.
import "./unit/Model.test";
import "./unit/generateJsonSchema.test";
import "./unit/validateSchema.test";
import "./unit/AllowDeny.test";
import "./unit/DenyUntrusted.test";
import "./unit/DatabaseValidation.test";
import "./unit/ExistingCollection.test";
