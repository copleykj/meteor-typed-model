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

The test suite includes **49 comprehensive tests** (45 server-side + 4 client-side):

**Server-Side Tests (45 tests):**
- **Model CRUD Operations**: Insert, update, upsert, and find operations with schema validation
- **Custom Types**: Auto-populated fields like `stringId`, `createdTimestamp`, `updatedTimestamp`, `createdUser`, and `updatedUser`
- **Schema Validation**: Runtime validation with Zod and compile-time type safety
- **MongoDB Operators**: Support for `$set`, `$push`, `$addToSet`, `$inc`, `$unset`, and other MongoDB update operators
- **Schema Relaxation**: Conversion of strict schemas for flexible update operations
- **JSON Schema Generation**: MongoDB JSON Schema generation from Zod schemas
- **Type Inference**: Compile-time tests ensuring correct TypeScript type inference

**Client-Side Tests (4 tests):**
- **Package Loading**: Verification that the package loads correctly on the client
- **API Availability**: Ensures Model, CustomTypes, and SchemaHelpers are accessible
- **Model Instantiation**: Confirms Model instances can be created on the client

## Attribution

This package is composed mostly of code extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project created by Evan Broder.
