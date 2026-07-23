import chai from "chai";
import chaiAsPromised from "chai-as-promised";

// Extend Chai with chai-as-promised for async assertions
chai.use(chaiAsPromised);

// Shared test models (defined on both client and server)
import "./lib/clientTestModels";

// Client-side test suites. These must be static imports: on the client a
// dynamic import() is fetched over DDP and would not resolve until after the
// test driver has already run, leaving zero registered tests.
import "./client/basic.test";
import "./client/DenyUntrusted.test";
