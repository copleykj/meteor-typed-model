# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Meteor package that provides a Zod-validated, type-safe wrapper around Meteor's `Mongo.Collection`. The package enables runtime validation of MongoDB documents using Zod schemas while maintaining full TypeScript type safety. Extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project by Evan Broder.

## Development Commands

### Build and Type Checking
```bash
# Type check the TypeScript code
npx tsc --noEmit

# Lint the code
npx eslint .
```

### Meteor Package Management
This is a Meteor package, so testing/usage requires a Meteor project environment:
```bash
# In a Meteor app that uses this package
meteor test-packages typed:model
```

## Architecture

### Core Components

**Model Class** (`src/model.ts:424-643`)
- Central class that wraps `Mongo.Collection` with Zod schema validation
- Constructor accepts: `{ name, schema, idSchema?, collection? }`
- Provides async CRUD methods: `insertAsync`, `updateAsync`, `upsertAsync`, `removeAsync`, `findOneAsync`
- Handles both insert and update validation using context-aware transforms
- Supports bypassing schema validation with `bypassSchema` option
- Maintains index specifications via `addIndex` method

**Schema Validation Strategy**

The validation system uses Meteor's `EnvironmentVariable` to track operation context:
- `IsInsert` - Set during insert operations
- `IsUpdate` - Set during update operations (including $set operations)
- `IsUpsert` - Set during upsert operations

These context flags enable conditional transforms in custom types (e.g., `createdAt` only set on insert, `updatedAt` set on insert/update).

**Schema Relaxation** (`src/model.ts:46-108`)
The `relaxSchema` function converts strict Zod schemas into relaxed versions for update operations:
- Makes all fields optional
- Removes length requirements on arrays
- Handles MongoDB update operators ($set, $push, $addToSet, etc.)
- Applies defaults/transforms only when appropriate based on operation context

**MongoDB Update Parsing** (`src/model.ts:182-304`)
`parseMongoModifierAsync` handles complex MongoDB update modifiers:
- Recursively parses dot-notation field paths
- Applies schema validation to nested fields
- Handles all MongoDB update operators
- De-conflicts $setOnInsert with other operators

**JSON Schema Generation** (`src/generateJsonSchema.ts`)
Converts Zod schemas to MongoDB JSON Schema format for database-level validation:
- Supports most Zod types (objects, arrays, unions, intersections, etc.)
- Handles custom types via `attachCustomJsonSchema`
- Manages TypeScript intersection vs JSON Schema allOf semantics differences

### Schema Helpers

**CustomTypes** (`src/customTypes.ts`)
Pre-defined Zod types with automatic behavior:
- `stringId` - Auto-generated MongoDB ID
- `foreignKey` - Reference to another document
- `createdTimestamp` / `updatedTimestamp` - Auto-managed timestamps
- `createdUser` / `updatedUser` - Auto-populated user IDs
- `nonEmptyString` - String with min length 1
- `allowedEmptyString` - Explicitly allows empty strings
- `deleted` - Boolean soft-delete flag
- `uint8Array`, `portNumber`, `snowflake` - Specialized types
- **`denyUntrusted`** - Wrapper to prevent client-side modifications (see Security section below)

**Schema Composition Helpers**
- `withCommon` (`src/withCommon.ts`) - Adds both timestamp and user tracking fields
- `withTimestamps` (`src/withTimestamps.ts`) - Adds `createdAt` and `updatedAt`
- `withUsers` (`src/withUsers.ts`) - Adds `createdBy` and `updatedBy`

These helpers work with both `ZodObject` (via `.extend()`) and other schema types (via `.and()`).

### Type System

**Key Type Exports**
- `ModelType<M>` - Extracts the output type from a Model instance
- `Selector<T>` - Union type for MongoDB selectors (object, string ID, or ObjectID)
- `FieldsOf<T>` - Creates field projection type with 1/0 values
- `ModelResultType<T, S, F>` - Infers result type based on selector and field projection

**Type Inference**
The package provides sophisticated type inference:
- Field projections properly narrow return types
- Selectors with specific `_id` values type the result accordingly
- Input types use `z.input<Schema>` for flexible accepts
- Output types use `z.output<Schema>` for strict guarantees

## Package Structure

- `exports.ts` - Main package entry point, re-exports all public APIs
- `package.js` - Meteor package definition (versions, dependencies)
- `check-versions.ts` - Runtime dependency version checking
- `src/types/meteor.d.ts` - TypeScript type augmentations for Meteor

## Important Constraints

1. **Empty String Validation**: By default, string fields must not accept empty strings unless using `allowedEmptyString`. This is validated in `src/validateSchema.ts:60-71`.

2. **No Transforms in Queries**: Query methods (`find`, `findOne`, `findOneAsync`) don't allow transforms to keep types manageable.

3. **Full Documents as Modifiers**: Update operations reject full document replacements - only MongoDB update modifiers are accepted. This ensures transforms work correctly.

4. **Schema Validation**: All schemas are validated on Model construction to ensure they meet package requirements (e.g., no empty strings).

5. **Index Options**: Only specific MongoDB index options are supported: `unique`, `sparse`, `partialFilterExpression`, `expireAfterSeconds` (see `src/model.ts:341-346`).

## Security

### Client-Side Validation with `denyUntrusted`

The `denyUntrusted` helper prevents untrusted (client-side) code from modifying protected fields, similar to collection2/simple-schema's `denyUntrusted` custom validator. This is essential for security-sensitive fields that should only be set by server-side code.

**Implementation:** Protection is enforced via Meteor's `deny()` system, which means it works even if the underlying collection is accessed directly (not through Model methods). The deny rules are automatically registered when the Model is constructed.

**Basic Usage:**
```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
const { denyUntrusted, stringId, nonEmptyString } = CustomTypes;

const UserSchema = z.object({
  _id: stringId,
  username: nonEmptyString,
  email: nonEmptyString,
  // Security-sensitive fields protected from client modifications
  isAdmin: denyUntrusted(z.boolean().default(false)),
  role: denyUntrusted(z.enum(['user', 'moderator', 'admin']).default('user')),
  permissions: denyUntrusted(z.array(nonEmptyString).default([])),
  // Optional protected fields
  apiKey: denyUntrusted(nonEmptyString.optional()),
});

const Users = new Model({ name: 'users', schema: UserSchema });
```

**Behavior:**
- **Server (trusted) code**: Can set any value for protected fields via Model methods or direct collection access
- **Client (untrusted) code**:
  - Cannot set protected fields (Meteor.Error thrown with code 'untrusted-field-modification')
  - Must omit protected fields (will use default values or remain undefined)
  - Cannot circumvent by calling collection methods directly (deny rules still apply)

**Common Use Cases:**
1. **Authorization flags**: `isAdmin`, `isVerified`, `isBanned`
2. **Role/permission fields**: `role`, `permissions`, `accessLevel`
3. **System metadata**: `internalId`, `flags`, `status`
4. **Audit fields**: Custom audit fields beyond the auto-managed ones
5. **API credentials**: `apiKey`, `secretToken`

**Example - Preventing Privilege Escalation:**
```typescript
// Client attempts to make themselves an admin
try {
  await Users.insertAsync({
    username: 'hacker',
    email: 'hacker@example.com',
    isAdmin: true,  // ⚠️ This will be rejected!
  });
} catch (error) {
  // Error: "This field cannot be modified from untrusted code"
}

// Correct client usage - omit protected field
await Users.insertAsync({
  username: 'normaluser',
  email: 'user@example.com',
  // isAdmin omitted - will use default value (false)
});

// Server can set protected fields
if (Meteor.isServer) {
  await Users.insertAsync({
    username: 'admin',
    email: 'admin@example.com',
    isAdmin: true,  // ✅ Allowed on server
  });
}
```

**Auto-Protected Fields in Schema Helpers:**
- **`withUsers`**: Automatically protects **both** `createdBy` and `updatedBy` fields
- **`withTimestamps`**: Automatically protects **both** `createdAt` and `updatedAt` fields
- **`withCommon`**: Automatically protects all four fields (createdAt, updatedAt, createdBy, updatedBy)

All system-managed fields are automatically wrapped with `denyUntrusted` when using schema helpers:
```typescript
import { SchemaHelpers, CustomTypes } from 'meteor/typed:model';
const { withCommon } = SchemaHelpers;
const { nonEmptyString } = CustomTypes;

// All four fields are automatically protected
const MySchema = withCommon(z.object({
  name: nonEmptyString,
  email: nonEmptyString,
}));

// createdAt, updatedAt, createdBy, updatedBy are all protected automatically
const MyModel = new Model({ name: 'myCollection', schema: MySchema });
```

**MongoDB Update Operators:**
Protected fields work with all MongoDB update operators when called from server code:
```typescript
// Server-side updates of protected fields
await Users.updateAsync(userId, {
  $set: { role: 'admin' },  // ✅ Allowed on server
});

await Users.updateAsync(userId, {
  $push: { permissions: 'manage-users' },  // ✅ Allowed on server
});

await Users.updateAsync(userId, {
  $unset: { apiKey: '' },  // ✅ Allowed on server
});
```

**Technical Notes:**
- Protection enforced via **Meteor's `deny()` system**
- Deny rules automatically registered in Model constructor
- Works even if collection is accessed directly (not through Model methods)
- Field paths extracted by walking Zod schema during Model construction
- Supports nested field paths (e.g., `metadata.internalFlag`)
- Handles all MongoDB update operators (`$set`, `$push`, `$unset`, etc.)
- Compatible with Meteor Methods (server-side code, treated as trusted)
- **Server-side direct calls bypass deny rules** (as designed by Meteor)
- **Client-initiated operations (via DDP) trigger deny rules** and are blocked
- `bypassSchema` option skips Zod validation but deny rules still apply (unless called from server)

**Migration from collection2/simple-schema:**
```typescript
// simple-schema (old)
const UserSchema = new SimpleSchema({
  isAdmin: {
    type: Boolean,
    defaultValue: false,
    custom: SimpleSchema.denyUntrusted,
  },
});

// typed:model (new)
const UserSchema = z.object({
  isAdmin: denyUntrusted(z.boolean().default(false)),
});
```

## Testing

### Test Framework and Setup

The package uses **Mocha** with **Chai** assertions for testing, integrated via Meteor's test framework with **Playwright** for browser-based client tests:

```bash
# First time setup: Install Playwright browsers
npm run test:install-browsers
# Or manually: npx playwright install

# If you encounter issues, you may need system dependencies:
# sudo npx playwright install-deps

# Run all tests (server + client)
meteor npm test

# Or directly with Meteor
TEST_BROWSER_DRIVER=playwright meteor test-packages ./ --once --driver-package meteortesting:mocha
```

**Note:** Playwright requires Chromium to be downloaded (~100MB). The first `npm run test:install-browsers` or `npx playwright install` will download the browser binaries to `~/.cache/ms-playwright/`. On some Linux systems, you may need to install additional system dependencies with `sudo npx playwright install-deps`.

### Test Structure

```
tests/
├── main.ts                       # Test entry point (imports all test suites)
├── lib/
│   ├── AssertTypesEqual.ts      # TypeScript type equality assertion utility
│   └── resetDatabase.ts         # Database cleanup helper for test isolation
├── unit/                         # Server-side tests
│   ├── Model.test.ts            # Core Model CRUD and validation tests (~15KB)
│   ├── generateJsonSchema.test.ts # JSON schema generation tests (~20KB)
│   └── validateSchema.test.ts    # Schema validation policy tests (~1KB)
└── client/                       # Client-side tests
    └── basic.test.ts            # Basic package loading and functionality tests
```

### Test Coverage

The package includes **49 comprehensive tests**: 45 server-side tests and 4 client-side tests, all passing.

#### Server-Side Tests (45 tests)

**Model.test.ts** (`tests/unit/Model.test.ts`) - 17 tests
- `bypassSchema` option testing for insert and update operations
- Custom type behavior (`stringId`, `createdTimestamp`, `updatedTimestamp`)
- Schema relaxation for update operations (`relaxSchema`)
- MongoDB operation parsing (`parseMongoOperationAsync`)
- Modifier parsing with default values (`parseMongoModifierAsync`)
- TypeScript type inference validation using `AssertTypesEqual`

**generateJsonSchema.test.ts** (`tests/unit/generateJsonSchema.test.ts`) - 25 tests
- Basic Zod types (string, number, boolean, Date, null)
- String validations (min, max, length, regex, email, UUID, URL)
- Number validations (gt, lt, gte, lte, int, multipleOf)
- Enums (Zod enums, native TypeScript enums, literal unions)
- Arrays and array of unions
- Objects (strict, catchall, passthrough, optional fields)
- Complex types (unions, discriminated unions, intersections)
- Records (dynamic key-value pairs)
- Default values
- Error handling for unsupported types

**validateSchema.test.ts** (`tests/unit/validateSchema.test.ts`) - 3 tests
- Enforcement of non-empty string policy
- `nonEmptyString` helper validation
- `allowedEmptyString` explicit opt-in

#### Client-Side Tests (4 tests)

**basic.test.ts** (`tests/client/basic.test.ts`) - 4 tests
- Package loading and exports verification
- Model class availability on client
- CustomTypes and SchemaHelpers availability
- Basic Model instantiation

### Test Utilities

**createTestModel Factory Pattern**
```typescript
async function createTestModel<T extends MongoRecordZodType>(
  schema: T,
): Promise<Model<T, typeof stringId>> {
  const collectionName = `test_schema_${Random.id()}`;
  const model = new Model({ name: collectionName, schema });
  testModels.add(model);
  return model;
}
```
- Creates isolated test collections with unique random names
- Tracks models in a Set for automatic cleanup
- Used in `afterAll` hooks to drop collections

**Async Assertion Pattern with Chai-as-Promised**
```typescript
await assert.isFulfilled(model.insertAsync({ valid: "data" }));
await assert.isRejected(model.insertAsync({}), z.ZodError);
await assert.isRejected(
  collection.insertAsync({}),
  /Document failed validation/
);
```

**Type Safety Assertions**
```typescript
const typeTest: AssertTypesEqual<Expected, Actual> = true;
assert.isTrue(typeTest);
```
- Compile-time verification of TypeScript type inference
- Used extensively in Model.test.ts type declaration tests

**Mock Clock for Timestamp Testing**
```typescript
const initialDate = new Date();
setClock(() => initialDate);
// ... perform operations ...
resetClock(); // in afterEach
```

### Test Patterns

**Isolated Collections**: Each test creates unique collections with `Random.id()` to prevent test interference.

**Automatic Cleanup**: `afterAll` hooks drop test collections and clear tracking Sets.

**Real MongoDB**: Tests run against actual MongoDB (not mocks) in a Meteor environment.

**Nested Describe Blocks**: Organized by feature area (e.g., "customTypes" > "stringId").

**Shared Setup**: `beforeAll` hooks create test fixtures shared across related tests.

### Running Specific Tests

Mocha supports filtering tests by name using `--grep`:

```bash
TEST_BROWSER_DRIVER=playwright meteor test-packages ./ --once --driver-package meteortesting:mocha --grep "customTypes"
```

### Adding New Tests

When adding new tests:
1. Import utilities from `tests/lib/` as needed
2. Use `createTestModel` for Model tests or `createTestCollection` for schema tests
3. Add cleanup in `afterAll` hooks
4. Use `chai-as-promised` for async assertions
5. Follow existing test patterns for consistency
6. Add TypeScript type tests where appropriate using `AssertTypesEqual`

### Troubleshooting Tests

**Playwright browser not found:**
```bash
npx playwright install
```

**System dependencies missing (Linux):**
```bash
sudo npx playwright install-deps
```

**Port 3000 already in use:**
```bash
# Kill existing Meteor processes
pkill -f meteor
# Or use a different port
meteor test-packages ./ --port 3001 --once --driver-package meteortesting:mocha
```

**Client tests fail with "Cannot find module":**
- Ensure `Npm.depends()` in `package.js` matches the version in `package.json`
- Run `meteor reset` to clear cached builds
- Verify the dependency is installed in `node_modules/`
