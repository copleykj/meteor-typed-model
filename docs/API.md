# API Reference

Complete API documentation for the `typed:model` package.

## Table of Contents

- [Model Class](#model-class)
  - [Constructor](#constructor)
  - [Properties](#properties)
  - [CRUD Methods](#crud-methods)
  - [Security Methods](#security-methods)
  - [Index Management](#index-management)
- [Type Utilities](#type-utilities)
- [Advanced Functions](#advanced-functions)
- [Global Collections](#global-collections)

---

## Model Class

The `Model` class wraps a Meteor `Mongo.Collection` with Zod schema validation and full TypeScript type inference.

### Constructor

```typescript
new Model<T extends MongoRecordZodType, I extends z.ZodTypeAny = typeof stringId>({
  name: string,
  schema: T,
  idSchema?: I,
  collection?: Mongo.Collection<any>
})
```

Creates a new Model instance.

**Type Parameters:**
- `T` - The Zod schema type for documents
- `I` - The Zod schema type for document IDs (defaults to `stringId`)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | The name of the MongoDB collection |
| `schema` | `T extends MongoRecordZodType` | Yes | Zod schema for document validation |
| `idSchema` | `I extends z.ZodTypeAny` | No | Zod schema for the `_id` field (defaults to `stringId`) |
| `collection` | `Mongo.Collection<any>` | No | Existing collection to wrap (creates new if not provided) |

**Example:**

```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;

// Basic model
const TaskModel = new Model({
  name: 'tasks',
  schema: z.object({
    title: nonEmptyString,
    completed: z.boolean(),
  }),
});

// Model with custom ID schema
const UuidModel = new Model({
  name: 'items',
  schema: z.object({ name: z.string() }),
  idSchema: z.string().uuid(),
});

// Wrap existing collection
const UserModel = new Model({
  name: 'users',
  schema: UserSchema,
  collection: Meteor.users,
});
```

**Throws:**
- `Error` if schema doesn't pass validation (e.g., contains empty string validators)

---

### Properties

#### `collection`

```typescript
readonly collection: Mongo.Collection<z.output<T> & { _id: z.output<I> }>
```

Direct access to the underlying Mongo.Collection. Allow/deny rules still apply when using this property.

**Example:**

```typescript
// Both enforce the same validation and security rules
await TaskModel.insertAsync({ title: 'Task 1', completed: false });
await TaskModel.collection.insertAsync({ title: 'Task 1', completed: false });

// Access collection methods
const cursor = TaskModel.collection.find({});
TaskModel.collection.createIndex({ title: 1 });
```

---

### CRUD Methods

#### `insertAsync`

```typescript
insertAsync(
  doc: z.input<T>,
  options?: {
    bypassSchema?: boolean; // Server-only
  }
): Promise<z.output<I>>
```

Inserts a new document into the collection with schema validation.

**Parameters:**
- `doc` - Document to insert (using input type, allows defaults/transforms)
- `options.bypassSchema` - **Server-only**: Skip schema validation (default: `false`)

**Returns:**
- Promise resolving to the inserted document's `_id`

**Example:**

```typescript
// Basic insert
const taskId = await TaskModel.insertAsync({
  title: 'Buy groceries',
  completed: false,
});

// With auto-populated fields (using withCommon)
const linkId = await LinkModel.insertAsync({
  title: 'Google',
  url: 'https://google.com',
  // createdAt, updatedAt, createdBy, updatedBy auto-populated
});

// Server-only: bypass validation for migration
if (Meteor.isServer) {
  await TaskModel.insertAsync(
    { title: '', completed: false },
    { bypassSchema: true }
  );
}
```

**Throws:**
- `z.ZodError` if document doesn't match schema
- `Meteor.Error` on client if schema validation fails (formatted Zod error)
- `Error` if `bypassSchema` is used on client

---

#### `updateAsync`

```typescript
updateAsync(
  selector: Selector<z.output<T> & { _id: z.output<I> }>,
  modifier: MongoModifier<z.input<T>>,
  options?: {
    multi?: boolean;
    upsert?: boolean;
    bypassSchema?: boolean; // Server-only
  }
): Promise<number>
```

Updates one or more documents with schema validation.

**Parameters:**
- `selector` - MongoDB selector (object, string ID, or ObjectID)
- `modifier` - MongoDB update modifier (must use operators like `$set`, `$push`, etc.)
- `options.multi` - Update all matching documents (default: `false`)
- `options.upsert` - Insert if no documents match (default: `false`)
- `options.bypassSchema` - **Server-only**: Skip schema validation (default: `false`)

**Returns:**
- Promise resolving to the number of documents affected

**Example:**

```typescript
// Update single document by ID
await TaskModel.updateAsync(taskId, {
  $set: { completed: true },
});

// Update with multiple operators
await TaskModel.updateAsync(taskId, {
  $set: { title: 'Updated title' },
  $inc: { priority: 1 },
});

// Update multiple documents
await TaskModel.updateAsync(
  { completed: false },
  { $set: { archived: true } },
  { multi: true }
);

// Upsert
await TaskModel.updateAsync(
  { externalId: '123' },
  { $set: { title: 'New Task' } },
  { upsert: true }
);
```

**Throws:**
- `z.ZodError` if modifier doesn't match schema
- `Error` if modifier is a full document replacement (must use operators)
- `Meteor.Error` on client if validation fails

**Supported MongoDB Operators:**
- `$set`, `$unset`
- `$inc`, `$mul`, `$min`, `$max`
- `$push`, `$pull`, `$addToSet`
- `$pop`, `$pullAll`
- `$currentDate`, `$setOnInsert`
- `$bit`, `$rename`

---

#### `upsertAsync`

```typescript
upsertAsync(
  selector: Selector<z.output<T> & { _id: z.output<I> }>,
  modifier: MongoModifier<z.input<T>>,
  options?: {
    multi?: boolean;
    bypassSchema?: boolean; // Server-only
  }
): Promise<{
  numberAffected: number;
  insertedId?: z.output<I>;
}>
```

Updates an existing document or inserts a new one if none match.

**Parameters:**
- `selector` - MongoDB selector
- `modifier` - MongoDB update modifier
- `options.multi` - Upsert multiple documents (default: `false`)
- `options.bypassSchema` - **Server-only**: Skip schema validation (default: `false`)

**Returns:**
- Promise resolving to `{ numberAffected, insertedId? }`

**Example:**

```typescript
const result = await TaskModel.upsertAsync(
  { externalId: '123' },
  { $set: { title: 'New Task', completed: false } }
);

if (result.insertedId) {
  console.log('Inserted new document:', result.insertedId);
} else {
  console.log('Updated existing document');
}
```

---

#### `removeAsync`

```typescript
removeAsync(
  selector: Selector<z.output<T> & { _id: z.output<I> }>
): Promise<number>
```

Removes one or more documents from the collection.

**Parameters:**
- `selector` - MongoDB selector (object, string ID, or ObjectID)

**Returns:**
- Promise resolving to the number of documents removed

**Example:**

```typescript
// Remove by ID
await TaskModel.removeAsync(taskId);

// Remove by query
const count = await TaskModel.removeAsync({ completed: true });
console.log(`Removed ${count} completed tasks`);
```

---

#### `find`

```typescript
find(
  selector?: Mongo.Selector<z.output<T> & { _id: z.output<I> }>,
  options?: Omit<Mongo.Options<z.output<T> & { _id: z.output<I> }>, 'transform'>
): Mongo.Cursor<z.output<T> & { _id: z.output<I> }>
```

Finds documents matching the selector and returns a cursor.

**Parameters:**
- `selector` - MongoDB selector (optional, defaults to `{}`)
- `options` - Query options (fields, sort, limit, skip, etc.)

**Returns:**
- Mongo.Cursor with full type inference

**Example:**

```typescript
// Find all
const allTasks = TaskModel.find().fetch();

// Find with selector
const completedTasks = TaskModel.find({ completed: true }).fetch();

// Find with options
const recentTasks = TaskModel.find(
  {},
  {
    sort: { createdAt: -1 },
    limit: 10,
    fields: { title: 1, completed: 1 },
  }
).fetch();

// Use cursor methods
TaskModel.find().forEach((task) => {
  console.log(task.title);
});

// Count documents
const count = TaskModel.find({ completed: false }).count();
```

**Note:** The `transform` option is not available to keep types manageable.

---

#### `findOne`

```typescript
findOne(
  selector?: Mongo.Selector<z.output<T> & { _id: z.output<I> }> | z.output<I>,
  options?: Omit<Mongo.Options<z.output<T> & { _id: z.output<I> }>, 'transform'>
): (z.output<T> & { _id: z.output<I> }) | undefined
```

Finds a single document synchronously. Use only in reactive contexts (publications, Tracker computations).

**Parameters:**
- `selector` - MongoDB selector or document ID
- `options` - Query options

**Returns:**
- Matching document or `undefined`

**Example:**

```typescript
// Find by ID
const task = TaskModel.findOne(taskId);

// Find by query
const firstCompleted = TaskModel.findOne({ completed: true });

// With field projection
const titleOnly = TaskModel.findOne(taskId, {
  fields: { title: 1 },
});
// Type: { _id: string, title: string } | undefined
```

---

#### `findOneAsync`

```typescript
findOneAsync(
  selector?: Mongo.Selector<z.output<T> & { _id: z.output<I> }> | z.output<I>,
  options?: Omit<Mongo.Options<z.output<T> & { _id: z.output<I> }>, 'transform'>
): Promise<(z.output<T> & { _id: z.output<I> }) | undefined>
```

Finds a single document asynchronously (preferred in most cases).

**Parameters:**
- `selector` - MongoDB selector or document ID
- `options` - Query options

**Returns:**
- Promise resolving to matching document or `undefined`

**Example:**

```typescript
// Find by ID
const task = await TaskModel.findOneAsync(taskId);

// Find by query
const firstIncomplete = await TaskModel.findOneAsync({
  completed: false,
});

// With field projection and type narrowing
const partial = await TaskModel.findOneAsync(
  { title: 'Important' },
  { fields: { title: 1, priority: 1 } }
);
// Type: { _id: string, title: string, priority: number } | undefined
```

---

### Security Methods

#### `allow`

```typescript
allow(rules: {
  insert?: (userId: string | null, doc: z.output<T> & { _id: z.output<I> }) => boolean;
  update?: (
    userId: string | null,
    doc: z.output<T> & { _id: z.output<I> },
    fieldNames: string[],
    modifier: any
  ) => boolean;
  remove?: (userId: string | null, doc: z.output<T> & { _id: z.output<I> }) => boolean;
  fetch?: string[];
  transform?: null;
}): void
```

Defines allow rules for client-side operations. At least one allow rule must return `true` for an operation to succeed.

**Parameters:**

| Rule | Parameters | Description |
|------|------------|-------------|
| `insert` | `userId`, `doc` | Return `true` to allow insert |
| `update` | `userId`, `doc`, `fieldNames`, `modifier` | Return `true` to allow update |
| `remove` | `userId`, `doc` | Return `true` to allow remove |
| `fetch` | Array of field names | Fields to fetch from DB for rules (performance optimization) |

**Example:**

```typescript
TaskModel.allow({
  insert: (userId, doc) => {
    // Only logged-in users can insert
    return userId !== null;
  },
  update: (userId, doc) => {
    // Only the creator can update
    return userId !== null && doc.createdBy === userId;
  },
  remove: (userId, doc) => {
    // Only the creator can remove
    return userId !== null && doc.createdBy === userId;
  },
  fetch: ['createdBy'], // Only fetch createdBy field
});
```

See [Client-Side Security](../README.md#client-side-security-with-allowdeny-rules) for more details.

---

#### `deny`

```typescript
deny(rules: {
  insert?: (userId: string | null, doc: z.output<T> & { _id: z.output<I> }) => boolean;
  update?: (
    userId: string | null,
    doc: z.output<T> & { _id: z.output<I> },
    fieldNames: string[],
    modifier: any
  ) => boolean;
  remove?: (userId: string | null, doc: z.output<T> & { _id: z.output<I> }) => boolean;
  fetch?: string[];
  transform?: null;
}): void
```

Defines deny rules for client-side operations. If any deny rule returns `true`, the operation is rejected (overrides allow rules).

**Parameters:**

Same as `allow()` method.

**Example:**

```typescript
TaskModel.deny({
  update: (userId, doc, fieldNames) => {
    // Never allow changing the creator
    return fieldNames.includes('createdBy');
  },
  remove: (userId, doc) => {
    // Never allow removing completed tasks
    return doc.completed === true;
  },
});
```

**Rule Evaluation Order:**
1. Deny rules checked first
2. Allow rules checked second
3. Default: deny if no allow rules return `true`

---

### Index Management

#### `addIndex`

```typescript
addIndex(
  specification: Record<string, number | string>,
  options?: {
    unique?: boolean;
    sparse?: boolean;
    partialFilterExpression?: Record<string, any>;
    expireAfterSeconds?: number;
  }
): void
```

Adds an index specification to be created when the Model is instantiated on the server.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `specification` | `Record<string, number \| string>` | Index fields and sort direction |
| `options.unique` | `boolean` | Create unique index |
| `options.sparse` | `boolean` | Create sparse index (omits documents without field) |
| `options.partialFilterExpression` | `object` | Index only documents matching filter |
| `options.expireAfterSeconds` | `number` | TTL index (auto-delete after seconds) |

**Example:**

```typescript
// Simple index
TaskModel.addIndex({ title: 1 });

// Compound index
TaskModel.addIndex({ userId: 1, createdAt: -1 });

// Unique index
TaskModel.addIndex({ email: 1 }, { unique: true });

// Sparse index (only documents with field)
TaskModel.addIndex({ phoneNumber: 1 }, { sparse: true });

// Partial index (conditional)
TaskModel.addIndex(
  { status: 1 },
  { partialFilterExpression: { status: { $eq: 'active' } } }
);

// TTL index (auto-delete after 30 days)
TaskModel.addIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);
```

**Note:** Indexes are only created on the server. Multiple calls with the same specification will add multiple index definitions (usually not desired).

---

## Type Utilities

### `ModelType<M>`

Extracts the output type from a Model instance.

```typescript
type ModelType<M extends Model<any, any>> = ...
```

**Example:**

```typescript
const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

export type TaskType = ModelType<typeof TaskModel>;
// Type: { _id: string, title: string, completed: boolean, ... }

function processTask(task: TaskType) {
  console.log(task.title);
}
```

---

### `Selector<T>`

Union type representing valid MongoDB selectors.

```typescript
type Selector<T> =
  | Mongo.Selector<T>
  | string
  | Mongo.ObjectID
```

**Example:**

```typescript
// All valid selectors
const selector1: Selector<Task> = taskId; // string ID
const selector2: Selector<Task> = { completed: false }; // query object
const selector3: Selector<Task> = new Mongo.ObjectID(taskId); // ObjectID
```

---

### `FieldsOf<T>`

Creates a type for MongoDB field projections.

```typescript
type FieldsOf<T> = {
  [K in keyof T]?: 1 | 0;
}
```

**Example:**

```typescript
const fields: FieldsOf<Task> = {
  title: 1,
  completed: 1,
  _id: 0, // Exclude _id
};

const task = await TaskModel.findOneAsync({}, { fields });
// Type automatically narrows based on projection
```

---

### `ModelResultType<T, S, F>`

Infers the result type based on selector and field projection.

```typescript
type ModelResultType<T, S extends Selector<T>, F extends FieldsOf<T>> = ...
```

This type is used internally for return type inference. You typically won't use it directly.

---

## Advanced Functions

### `relaxSchema`

```typescript
function relaxSchema<T extends z.ZodTypeAny>(schema: T): z.ZodTypeAny
```

Converts a strict Zod schema into a relaxed version for update operations. Used internally by `updateAsync` and `upsertAsync`.

**Transformations:**
- Makes all object fields optional
- Removes array length requirements
- Adds support for MongoDB update operators
- Preserves validation for values that are provided

**Example:**

```typescript
import { relaxSchema } from 'meteor/typed:model';

const strictSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string()).min(1),
});

const relaxedSchema = relaxSchema(strictSchema);
// Can now accept: { title: string } | { tags: string[] } | {}
// Arrays no longer require min length
```

**Use Case:** You typically don't need to call this directly. The Model class uses it automatically for updates.

---

### `parseMongoModifierAsync`

```typescript
async function parseMongoModifierAsync<T extends z.ZodTypeAny>(
  schema: T,
  modifier: any
): Promise<any>
```

Parses and validates a MongoDB update modifier against a schema. Used internally by `updateAsync` and `upsertAsync`.

**Features:**
- Validates all update operators (`$set`, `$push`, etc.)
- Handles dot-notation field paths
- Applies defaults and transforms appropriately
- De-conflicts `$setOnInsert` with other operators

**Example:**

```typescript
import { parseMongoModifierAsync } from 'meteor/typed:model';

const modifier = {
  $set: { 'profile.name': 'John' },
  $push: { tags: 'important' },
  $inc: { viewCount: 1 },
};

const validated = await parseMongoModifierAsync(UserSchema, modifier);
// Throws z.ZodError if validation fails
```

**Use Case:** Advanced scenarios where you need to validate modifiers outside of Model methods.

---

### `parseMongoOperationAsync`

```typescript
async function parseMongoOperationAsync<T extends z.ZodTypeAny>(
  schema: T,
  operation: any
): Promise<any>
```

Parses and validates a MongoDB operation (either a document or a modifier). Used internally by insert/update operations.

**Example:**

```typescript
import { parseMongoOperationAsync } from 'meteor/typed:model';

// Validates a full document
const doc = await parseMongoOperationAsync(TaskSchema, {
  title: 'New Task',
  completed: false,
});

// Or validates a modifier
const modifier = await parseMongoOperationAsync(TaskSchema, {
  $set: { completed: true },
});
```

---

## Global Collections

### `AllModels`

```typescript
const AllModels: Set<Model<any, any>>
```

A global Set containing all Model instances created in the application.

**Example:**

```typescript
import { AllModels } from 'meteor/typed:model';

// Iterate over all models
for (const model of AllModels) {
  console.log('Collection:', model.collection._name);
}

// Check if a model exists
const exists = Array.from(AllModels).some(
  m => m.collection._name === 'tasks'
);

// Count total models
console.log(`Total models: ${AllModels.size}`);
```

**Use Cases:**
- Debugging and introspection
- Applying global operations across all collections
- Testing and cleanup

---

## See Also

- [Custom Types](CUSTOM_TYPES.md) - Pre-built Zod types
- [Schema Helpers](SCHEMA_HELPERS.md) - Schema composition utilities
- [Type System](TYPE_SYSTEM.md) - Type inference details
- [Advanced Features](ADVANCED.md) - Deep dives into advanced topics
- [Best Practices](BEST_PRACTICES.md) - Patterns and recommendations
