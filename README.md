# Meteor Typed Model

A Zod validated, type safe wraper around Meteor Mongo Collections.

## Package Status

This package is currently a WIP. Documentation is incomplete, but the code is reliable and has been extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project. The package includes comprehensive test coverage migrated from JollyRoger.

## Installation

Install `typed:model` and `zod`:

```bash
meteor add typed:model
meteor npm install zod
```

## Usage

### Basic Usage

```typescript
import { Model, CustomTypes, SchemaHelpers } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;
const { withCommon } = SchemaHelpers;

const Link = withCommon(
  z.object({
    title: nonEmptyString,
    url: z.string().url(),
  })
);

export const LinkModel = new Model({
  name: 'links',
  schema: Link,
});
export type LinkType = ModelType<typeof LinkModel>;

LinkModel.insert({ title: 'Google', url: 'https://google.com' });

// Find a link by title and limit the fields returned to just the title.
// Notice that the return type is properly inferred to only have a title and
// and no other extraneous fields as you would have with a normal Meteor collection.
const foundLink = LinkModel.findOneAsync({ title: 'Google' }, { fields: { title: 1 } });
```

### Usage With Existing Collection

```typescript
import { Model } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';
import { z } from 'zod';

const User = z.object({
  // Define schema necessary to accomodate Meteor's data structure for users
});

export const UserModel = new Model({
  name: 'users',
  schema: User,
  collection: Meteor.users,
});
export type UserType = ModelType<typeof User>;

const foundUser = UserModel.findOneAsync({ _id: Meteor.userId() });
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

**Field-Level Restrictions (Manual):**

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

The test suite includes **65 comprehensive tests** (61 server-side + 4 client-side):

**Server-Side Tests (61 tests):**
- **Model CRUD Operations**: Insert, update, upsert, and find operations with schema validation
- **Custom Types**: Auto-populated fields like `stringId`, `createdTimestamp`, `updatedTimestamp`, `createdUser`, and `updatedUser`
- **Schema Validation**: Runtime validation with Zod and compile-time type safety
- **MongoDB Operators**: Support for `$set`, `$push`, `$addToSet`, `$inc`, `$unset`, and other MongoDB update operators
- **Schema Relaxation**: Conversion of strict schemas for flexible update operations
- **JSON Schema Generation**: MongoDB JSON Schema generation from Zod schemas
- **Type Inference**: Compile-time tests ensuring correct TypeScript type inference
- **Allow/Deny Security**: Auto-applied validation rules, custom allow/deny rules, rule evaluation order, server-only bypassSchema enforcement, error formatting, and integration with Model methods

**Client-Side Tests (4 tests):**
- **Package Loading**: Verification that the package loads correctly on the client
- **API Availability**: Ensures Model, CustomTypes, and SchemaHelpers are accessible
- **Model Instantiation**: Confirms Model instances can be created on the client

## Attribution

This package is composed mostly of code extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project created by Evan Broder.
