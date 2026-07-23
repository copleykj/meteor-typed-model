# Meteor Typed Model

A Zod validated, type-safe wrapper around Meteor Mongo Collections with automatic runtime validation and full TypeScript type inference.

## Features

- **Type-Safe**: Full TypeScript type inference for queries, inserts, and updates
- **Runtime Validation**: Automatic Zod schema validation on all operations
- **Zero Boilerplate**: Auto-populated timestamps, user tracking, and IDs
- **Smart Updates**: MongoDB update operators with schema validation
- **Field Projections**: Return types automatically narrow based on field selection
- **Client Security**: Automatic validation deny rules with Meteor's allow/deny system
- **Protected Fields**: `denyUntrusted()` helper prevents privilege escalation attacks
- **Database Validation**: Opt-in `attachValidator` generates MongoDB JSON Schema validators from your Zod schema
- **Custom Types**: Pre-built Zod types for common patterns
- **Schema Helpers**: Easy composition with `withTimestamps`, `withUsers`, and `withCommon`
- **Production Ready**: Extracted from [JollyRoger](https://github.com/deathandmayhem/jolly-roger) with **144 tests** (112 server + 32 client)

## Installation

Install `typed:model` and `zod`:

```bash
meteor add typed:model
meteor npm install zod
```

> Version 2.x of this package requires **Zod 4** (`^4.0.0`). If you are on Zod 3, stay on `typed:model@1.x`.

## Quick Start

```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;

// Define your schema
const TaskSchema = z.object({
  title: nonEmptyString,
  completed: z.boolean().default(false),
});

// Create a model
const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

// Use it!
const taskId = await TaskModel.insertAsync({
  title: 'Learn typed:model',
  completed: false,
});

const task = await TaskModel.findOneAsync(taskId);
console.log(task.title); // Full type safety!
```

## Getting Started

### Step 1: Define Your Schema

Start by defining a Zod schema for your documents:

```typescript
import { z } from 'zod';
import { CustomTypes, SchemaHelpers } from 'meteor/typed:model';

const { nonEmptyString } = CustomTypes;
const { withCommon } = SchemaHelpers;

// Basic schema
const LinkSchema = z.object({
  title: nonEmptyString,
  url: z.string().url(),
});

// With automatic timestamps and user tracking
const LinkSchemaWithMeta = withCommon(LinkSchema);
// Adds: createdAt, updatedAt, createdBy, updatedBy
```

### Step 2: Create a Model

Create a Model instance to wrap your collection:

```typescript
import { Model } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';

export const LinkModel = new Model({
  name: 'links',
  schema: LinkSchemaWithMeta,
});

// Export the inferred type for use throughout your app
export type LinkType = ModelType<typeof LinkModel>;
```

### Step 3: Use Your Model

Use the Model's async methods with full type safety:

```typescript
// Insert (returns the _id)
const linkId = await LinkModel.insertAsync({
  title: 'Meteor Docs',
  url: 'https://docs.meteor.com',
});

// Find one
const link = await LinkModel.findOneAsync(linkId);
console.log(link.title); // TypeScript knows all fields!

// Update with MongoDB operators
await LinkModel.updateAsync(linkId, {
  $set: { title: 'Updated Title' },
});

// Find with field projection (return type is automatically narrowed!)
const titleOnly = await LinkModel.findOneAsync(
  { _id: linkId },
  { fields: { title: 1 } }
);
// titleOnly has type: { _id: string, title: string }

// Query with cursor
const allLinks = LinkModel.find({}).fetch();

// Remove
await LinkModel.removeAsync(linkId);
```

### Step 4: Set Up Client Security

Define allow/deny rules for client-side operations:

```typescript
// Allow users to insert their own links
LinkModel.allow({
  insert: (userId, doc) => {
    return userId !== null && doc.createdBy === userId;
  },
  update: (userId, doc) => {
    return userId !== null && doc.createdBy === userId;
  },
  remove: (userId, doc) => {
    return userId !== null && doc.createdBy === userId;
  },
});
```

See [Client-Side Security](#client-side-security-with-allowdeny-rules) below for more details.

## Documentation

- **[API Reference](docs/API.md)** - Complete API documentation for Model class and methods
- **[Custom Types](docs/CUSTOM_TYPES.md)** - Pre-built Zod types for common patterns
- **[Schema Helpers](docs/SCHEMA_HELPERS.md)** - Composition helpers like `withCommon`, `withTimestamps`, `withUsers`
- **[Type System](docs/TYPE_SYSTEM.md)** - TypeScript type inference and type utilities
- **[Advanced Features](docs/ADVANCED.md)** - Schema relaxation, MongoDB operators, indexes
- **[Migration Guide](docs/MIGRATION.md)** - Migrating from vanilla collections or collection2
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - FAQ and common issues
- **[Best Practices](docs/BEST_PRACTICES.md)** - Performance, security, and design patterns

## Basic Usage Examples

### Working With Existing Collections

You can wrap existing Meteor collections like `Meteor.users`:

```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;

const UserSchema = z.object({
  // Note: use nonEmptyString rather than z.string() - string fields must not
  // accept empty strings (see Important Constraints)
  username: nonEmptyString.optional(),
  emails: z.array(z.object({
    address: z.string().email(),
    verified: z.boolean(),
  })).optional(),
  createdAt: z.date().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
  services: z.record(z.string(), z.unknown()).optional(),
  // ... extend to match your user structure
});

const UserModel = new Model({
  name: 'users',
  schema: UserSchema,
  collection: Meteor.users,
});

const user = await UserModel.findOneAsync(Meteor.userId()!);
```

### Type Extraction

Extract TypeScript types from your models:

```typescript
import type { ModelType } from 'meteor/typed:model';

export const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

// Extract the document type
export type TaskType = ModelType<typeof TaskModel>;

// Use in functions
function processTask(task: TaskType) {
  console.log(task.title);
}
```

### MongoDB Update Operators

All MongoDB update operators are validated against your schema:

```typescript
await TaskModel.updateAsync(taskId, {
  $set: { title: 'New Title' },
  $inc: { priority: 1 },
  $push: { tags: 'urgent' },
  $addToSet: { watchers: userId },
  $unset: { dueDate: '' },
});
```

## Client-Side Security with Allow/Deny Rules

The `typed:model` package provides automatic schema validation for client-side database operations using Meteor's allow/deny system, similar to the `collection2` package. This ensures that data validation happens transparently on both the client and server.

### Automatic Schema Validation

When you create a Model, validation deny rules are automatically applied to the underlying Mongo.Collection. These rules:

- **Run only for client-initiated operations** (server-side code is trusted and bypasses these rules)
- **Validate all documents** against your Zod schema before they reach the database
- **Work even with direct collection access** (e.g., `model.collection.insertAsync()`)
- **Format Zod errors** as Meteor errors for consistent error handling

This means validation happens automatically without any additional setup, but you still need to define allow rules to permit client-side operations.

### Setting Allow Rules

Allow rules determine which client-side operations are permitted. At least one allow rule must return `true` for an operation to succeed:

```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;

const PostSchema = z.object({
  title: nonEmptyString,
  content: nonEmptyString,
  authorId: z.string(),
  published: z.boolean().default(false),
});

const PostModel = new Model({
  name: 'posts',
  schema: PostSchema,
});

// Allow users to insert their own posts
PostModel.allow({
  insert: (userId, doc) => {
    // Only allow if user is logged in and is the author
    return userId !== null && doc.authorId === userId;
  },
  update: (userId, doc, fieldNames, modifier) => {
    // Only allow authors to update their own posts
    return userId !== null && doc.authorId === userId;
  },
  remove: (userId, doc) => {
    // Only allow authors to remove their own posts
    return userId !== null && doc.authorId === userId;
  },
});
```

### Setting Deny Rules

Deny rules block operations even if allow rules would permit them. If any deny rule returns `true`, the operation is rejected:

```typescript
// Prevent updates to published posts
PostModel.deny({
  update: (userId, doc) => {
    // Deny updates to published posts
    return doc.published === true;
  },
  remove: (userId, doc) => {
    // Never allow removing published posts
    return doc.published === true;
  },
});

// Prevent changes to the authorId field
PostModel.deny({
  update: (userId, doc, fieldNames) => {
    // Deny if trying to modify authorId
    return fieldNames.includes('authorId');
  },
});
```

### Protecting Sensitive Fields with `denyUntrusted`

For fields that should **never** be modified by client code (like `isAdmin`, `role`, or system metadata), use the `denyUntrusted()` helper instead of writing custom deny rules:

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { denyUntrusted, nonEmptyString } = CustomTypes;

const UserSchema = z.object({
  username: nonEmptyString,
  email: nonEmptyString,

  // These fields are automatically protected from ALL client modifications
  isAdmin: denyUntrusted(z.boolean().default(false)),
  role: denyUntrusted(z.enum(['user', 'moderator', 'admin']).default('user')),
  permissions: denyUntrusted(z.array(nonEmptyString).default([])),
});

const UserModel = new Model({ name: 'users', schema: UserSchema });

// CLIENT: ❌ This will be denied
try {
  await UserModel.collection.insertAsync({
    username: 'hacker',
    email: 'hacker@example.com',
    isAdmin: true, // Attempt to escalate privileges - DENIED!
  });
} catch (error) {
  // Meteor.Error: "Cannot modify protected field 'isAdmin' from client code"
}

// CLIENT: ✅ This succeeds (protected field omitted)
await UserModel.collection.insertAsync({
  username: 'user',
  email: 'user@example.com',
  // isAdmin omitted - will use default (false)
});

// SERVER: ✅ Server can set protected fields freely
if (Meteor.isServer) {
  await UserModel.insertAsync({
    username: 'admin',
    email: 'admin@example.com',
    isAdmin: true, // Allowed on server
    role: 'admin',
  });
}
```

**Benefits of `denyUntrusted`:**
- **Schema-level protection**: Defined where your data structure is defined
- **Works everywhere**: Protects even if collection is accessed directly
- **Defense in depth**: Uses Meteor's `deny()` system under the hood
- **Auto-protected helpers**: `withCommon`, `withTimestamps`, and `withUsers` automatically protect their fields

See [Custom Types - denyUntrusted](docs/CUSTOM_TYPES.md#denyuntrusted) for detailed documentation and examples.

### Rule Evaluation Order

Meteor evaluates security rules in a specific order:

1. **Deny rules** are checked first - if any return `true`, the operation is rejected
2. **Allow rules** are checked next - if any return `true`, the operation is permitted
3. If no rules are defined, or no allow rules return `true`, the operation is denied

This means deny rules take precedence over allow rules, allowing you to create exceptions to your allow rules.

### Server-Only Operations

The `bypassSchema` option allows server-side code to bypass validation entirely. This option is **only available on the server** - client attempts to use it will throw an error:

```typescript
// Server-side only
if (Meteor.isServer) {
  // Bypass validation for data migration
  await PostModel.insertAsync(
    { title: '', content: 'legacy', authorId: 'system' },
    { bypassSchema: true }
  );
}

// Client-side - will throw "bypassSchema option is only available on the server"
await PostModel.insertAsync(
  { title: '', content: 'test', authorId: userId },
  { bypassSchema: true } // Error!
);
```

### Direct Collection Access

The `collection` property on Model instances is public and provides direct access to the underlying Mongo.Collection. However, **allow/deny rules still apply** regardless of how you access the collection:

```typescript
// Both of these enforce the same allow/deny rules and schema validation:
await PostModel.insertAsync({ title: 'Test', content: 'Content', authorId: userId });
await PostModel.collection.insertAsync({ title: 'Test', content: 'Content', authorId: userId });
```

This means you can safely use the underlying collection methods when needed without bypassing security.

## Database-Level Validation

Allow/deny rules only cover writes that go through Meteor. To also enforce your schema inside MongoDB itself, opt in with `attachValidator: true`:

```typescript
const PostModel = new Model({
  name: 'posts',
  schema: PostSchema,
  attachValidator: true,
});
```

The Zod schema is converted to a MongoDB JSON Schema validator and attached to the collection. New collections get it via `createCollection`; existing ones are updated with `collMod`. Documents are then validated at two layers:

1. **Application (Zod)** - runs inside Model methods, applies transforms and defaults, and produces detailed error messages.
2. **Database (MongoDB JSON Schema)** - enforced by the MongoDB server, so it also catches writes from `rawCollection()`, other services, and admin tools.

`bypassSchema` bypasses both layers, passing `bypassDocumentValidation: true` to MongoDB.

A few things worth knowing:

- The option is **server-only**; it is ignored on the client.
- Attachment is asynchronous. All write methods await it internally, so there is no race, but a failure (an unconvertible schema, or existing documents that violate it) surfaces as a rejection from the **first CRUD operation**, not from the constructor — a constructor cannot await.
- Validation uses `validationLevel: 'strict'` and `validationAction: 'error'`.

See **[API Reference](docs/API.md)** for the full option list.

### Insecure Mode

When the `insecure` package is active (default for new Meteor projects), the package automatically adds permissive allow rules to prevent accidentally locking down your collection during development:

```bash
# Remove insecure mode in production
meteor remove insecure
```

Once you remove the insecure package, you must define explicit allow rules for client-side operations to work.

### Common Patterns

**Role-Based Access Control:**

```typescript
import { Roles } from 'meteor/alanning:roles';

PostModel.allow({
  insert: (userId) => userId !== null,
  update: (userId, doc) => {
    // Allow admins or the author
    return Roles.userIsInRole(userId, 'admin') || doc.authorId === userId;
  },
  remove: (userId) => Roles.userIsInRole(userId, 'admin'),
});
```

**Field-Level Restrictions:**

```typescript
PostModel.deny({
  update: (userId, doc, fieldNames) => {
    // Only admins can change published status
    if (fieldNames.includes('published')) {
      return !Roles.userIsInRole(userId, 'admin');
    }
    return false;
  },
});
```

**Fetch Specific Fields for Rules:**

```typescript
PostModel.allow({
  update: (userId, doc) => doc.authorId === userId,
  fetch: ['authorId'], // Only fetch authorId from database for performance
});
```

### Migration from collection2

If you're migrating from `collection2`, the security model is very similar:

**collection2:**
```typescript
Posts.attachSchema(PostSchema);
```

**typed:model:**
```typescript
const PostModel = new Model({ name: 'posts', schema: PostSchema });
// Validation deny rules are automatically applied!
```

Both packages use the same underlying allow/deny mechanism, so your existing allow/deny rules should work with minimal changes. The main difference is that validation happens automatically without calling `attachSchema()`.

See the [Migration Guide](docs/MIGRATION.md) for detailed migration instructions.

## Running Tests

The package includes comprehensive test coverage for all core functionality. To run the tests:

### Prerequisites

- Meteor 3.0.1 or later
- Node.js and npm

### Install Dependencies

```bash
meteor npm install
```

### Run Tests

```bash
meteor npm test
```

Or directly with Meteor:

```bash
TEST_BROWSER_DRIVER=playwright meteor test-packages ./ --once --driver-package meteortesting:mocha
```

**First time setup:** Install Playwright browsers:
```bash
npm run test:install-browsers
```

Or manually:
```bash
npx playwright install
```

Note: You may also need to install system dependencies for Playwright:
```bash
sudo npx playwright install-deps
```

### Test Coverage

The test suite includes **144 comprehensive tests** (112 server-side + 32 client-side):

**Server-Side Tests (112 tests):**
- **Model CRUD Operations**: Insert, update, upsert, and find operations with schema validation
- **Custom Types**: Auto-populated fields like `stringId`, `createdTimestamp`, `updatedTimestamp`, `createdUser`, and `updatedUser`
- **Schema Validation**: Runtime validation with Zod and compile-time type safety
- **MongoDB Operators**: Support for `$set`, `$push`, `$addToSet`, `$inc`, `$unset`, and other MongoDB update operators
- **Schema Relaxation**: Conversion of strict schemas for flexible update operations
- **JSON Schema Generation**: MongoDB JSON Schema generation from Zod schemas
- **Type Inference**: Compile-time tests ensuring correct TypeScript type inference
- **Allow/Deny Security**: Auto-applied validation rules, custom allow/deny rules, rule evaluation order, server-only bypassSchema enforcement, error formatting, and integration with Model methods
- **Protected Fields**: `denyUntrusted()` marker detection, field extraction, schema helper auto-protection, and deny rule registration
- **Database-Level Validation**: `attachValidator` opt-in behavior, `createCollection`/`collMod` attachment paths, two-layer validation, `bypassSchema`, and attachment-failure handling

**Client-Side Tests (32 tests):**
- **Package Loading**: Verification that the package loads correctly on the client
- **API Availability**: Ensures Model, CustomTypes, and SchemaHelpers are accessible
- **Model Instantiation**: Confirms Model instances can be created on the client
- **Protected Field Enforcement**: Comprehensive testing of `denyUntrusted()` protection:
  - Prevents client from setting protected fields on insert (via direct collection access)
  - Prevents client from updating protected fields (via direct collection access)
  - Prevents client from setting protected fields via `Model.insertAsync()`
  - Prevents client from updating protected fields via `Model.updateAsync()`
  - Works with all MongoDB operators ($set, $push, $unset, $inc, etc.)
  - Auto-protects timestamp and user tracking fields from schema helpers
  - Allows operations when protected fields are omitted
  - Proper error messages with field names

## Contributing

Contributions are welcome! Please:

1. Check existing issues or create a new one to discuss your idea
2. Fork the repository and create a feature branch
3. Write tests for your changes
4. Ensure all tests pass with `meteor npm test`
5. Submit a pull request

## Attribution

This package is composed mostly of code extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project created by Evan Broder.

## License

MIT
