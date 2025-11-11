# Advanced Features

Deep dive into advanced features and internals of `typed:model`.

## Table of Contents

- [Schema Relaxation](#schema-relaxation)
- [MongoDB Update Operators](#mongodb-update-operators)
- [Parsing Functions](#parsing-functions)
- [Index Management](#index-management)
- [Bypassing Validation](#bypassing-validation)
- [Direct Collection Access](#direct-collection-access)
- [JSON Schema Generation](#json-schema-generation)
- [Global Model Registry](#global-model-registry)
- [Validation Behavior](#validation-behavior)

---

## Schema Relaxation

### Overview

When you define a strict schema for inserts, updates need different validation rules. The `relaxSchema()` function transforms your schema for update operations.

### The `relaxSchema` Function

```typescript
function relaxSchema<T extends z.ZodTypeAny>(schema: T): z.ZodTypeAny
```

**What It Does:**

1. **Makes all fields optional** - Updates don't need to provide all fields
2. **Removes array length requirements** - Allows partial array updates
3. **Adds MongoDB operator support** - Validates `$set`, `$push`, etc.
4. **Preserves type validation** - Values still match expected types

**Example:**

```typescript
import { relaxSchema } from 'meteor/typed:model';
import { z } from 'zod';

// Strict schema for inserts
const strict = z.object({
  title: z.string().min(1),
  tags: z.array(z.string()).min(1), // Must have at least 1 tag
  count: z.number().min(0),
});

// Relaxed schema for updates
const relaxed = relaxSchema(strict);

// Now accepts partial updates:
relaxed.parse({
  title: 'Updated', // OK - only updating title
});

relaxed.parse({
  tags: [], // OK - array length not enforced in updates
});

relaxed.parse({
  $set: { title: 'New Title' }, // OK - supports operators
});
```

### When It's Used

The Model class automatically uses `relaxSchema` internally for:
- `updateAsync()`
- `upsertAsync()`

You typically don't need to call it directly.

### Technical Details

**Object Schemas:**

```typescript
z.object({
  required: z.string(),
  optional: z.string().optional(),
});

// Becomes:
z.object({
  required: z.string().optional(), // Now optional
  optional: z.string().optional(), // Still optional
}).partial();
```

**Array Schemas:**

```typescript
z.array(z.string()).min(2).max(10);

// Becomes:
z.array(z.string()).max(10);
// min() removed, max() preserved
```

**MongoDB Operators:**

The relaxed schema accepts an object with MongoDB update operators:

```typescript
{
  $set?: { [field]: value },
  $unset?: { [field]: '' },
  $inc?: { [field]: number },
  $push?: { [field]: value },
  $addToSet?: { [field]: value },
  $pull?: { [field]: value },
  // ... and all other MongoDB operators
}
```

---

## MongoDB Update Operators

### Supported Operators

`typed:model` validates all standard MongoDB update operators:

| Category | Operators |
|----------|-----------|
| **Field** | `$set`, `$unset`, `$setOnInsert`, `$rename` |
| **Numeric** | `$inc`, `$mul`, `$min`, `$max` |
| **Array** | `$push`, `$pull`, `$addToSet`, `$pop`, `$pullAll` |
| **Bitwise** | `$bit` |
| **Date** | `$currentDate` |

### Field Update Operators

#### `$set`

```typescript
await TaskModel.updateAsync(taskId, {
  $set: {
    title: 'New Title',
    completed: true,
    'nested.field': 'value', // Dot notation supported
  },
});
```

#### `$unset`

```typescript
await TaskModel.updateAsync(taskId, {
  $unset: {
    optionalField: '', // Value is ignored, field is removed
  },
});
```

#### `$setOnInsert`

Sets values only if document is being inserted (during upsert):

```typescript
await TaskModel.upsertAsync(
  { externalId: '123' },
  {
    $set: { title: 'Updated' }, // Always set
    $setOnInsert: { createdAt: new Date() }, // Only on insert
  }
);
```

#### `$rename`

```typescript
await TaskModel.updateAsync(taskId, {
  $rename: {
    oldFieldName: 'newFieldName',
  },
});
```

### Numeric Operators

#### `$inc`

Increment/decrement numeric values:

```typescript
await TaskModel.updateAsync(taskId, {
  $inc: {
    viewCount: 1, // Increment by 1
    priority: -1, // Decrement by 1
  },
});
```

#### `$mul`

Multiply numeric values:

```typescript
await TaskModel.updateAsync(taskId, {
  $mul: {
    price: 1.1, // Increase by 10%
  },
});
```

#### `$min` / `$max`

Update only if new value is smaller/larger:

```typescript
await TaskModel.updateAsync(taskId, {
  $min: { lowestScore: 50 }, // Update only if 50 < current value
  $max: { highestScore: 100 }, // Update only if 100 > current value
});
```

### Array Operators

#### `$push`

Add element to array:

```typescript
await TaskModel.updateAsync(taskId, {
  $push: {
    tags: 'urgent', // Add single element
  },
});

// With modifiers
await TaskModel.updateAsync(taskId, {
  $push: {
    tags: {
      $each: ['tag1', 'tag2'], // Add multiple
      $position: 0, // At beginning
      $slice: 10, // Keep only first 10
      $sort: 1, // Sort ascending
    },
  },
});
```

#### `$addToSet`

Add element only if not already present:

```typescript
await TaskModel.updateAsync(taskId, {
  $addToSet: {
    tags: 'important', // Only adds if 'important' not in array
  },
});

// Multiple values
await TaskModel.updateAsync(taskId, {
  $addToSet: {
    tags: { $each: ['tag1', 'tag2'] },
  },
});
```

#### `$pull`

Remove matching elements:

```typescript
await TaskModel.updateAsync(taskId, {
  $pull: {
    tags: 'outdated', // Remove 'outdated'
    scores: { $lt: 50 }, // Remove scores < 50
  },
});
```

#### `$pop`

Remove first or last element:

```typescript
await TaskModel.updateAsync(taskId, {
  $pop: {
    tags: 1, // Remove last element
    history: -1, // Remove first element
  },
});
```

#### `$pullAll`

Remove multiple specific values:

```typescript
await TaskModel.updateAsync(taskId, {
  $pullAll: {
    tags: ['old', 'outdated', 'deprecated'],
  },
});
```

### Date Operators

#### `$currentDate`

Set field to current date:

```typescript
await TaskModel.updateAsync(taskId, {
  $currentDate: {
    lastModified: true, // Set to current Date
    timestamp: { $type: 'timestamp' }, // BSON timestamp
  },
});
```

### Combining Operators

Multiple operators in one update:

```typescript
await TaskModel.updateAsync(taskId, {
  $set: { status: 'active' },
  $inc: { viewCount: 1 },
  $push: { history: { date: new Date(), action: 'viewed' } },
  $unset: { tempField: '' },
});
```

### Dot Notation

Access nested fields:

```typescript
await TaskModel.updateAsync(taskId, {
  $set: {
    'profile.name': 'John',
    'settings.theme': 'dark',
    'metadata.tags.0': 'first-tag', // Array element by index
  },
});
```

---

## Parsing Functions

### `parseMongoModifierAsync`

```typescript
async function parseMongoModifierAsync<T extends z.ZodTypeAny>(
  schema: T,
  modifier: any
): Promise<any>
```

Validates MongoDB update modifiers against a schema.

**Features:**
- Validates all update operators
- Handles dot-notation paths
- Applies schema transforms appropriately
- De-conflicts `$setOnInsert` with other operators

**Example:**

```typescript
import { parseMongoModifierAsync } from 'meteor/typed:model';

const modifier = {
  $set: { 'profile.name': 'John' },
  $inc: { age: 1 },
  $push: { tags: 'new' },
};

try {
  const validated = await parseMongoModifierAsync(UserSchema, modifier);
  // validated contains the parsed and transformed modifier
} catch (error) {
  // z.ZodError if validation fails
  console.error('Invalid modifier:', error);
}
```

**Use Cases:**
- Custom update logic outside of Model methods
- Batch operations with validated modifiers
- Building update middleware

**Internal Usage:**

The Model class uses this function in `updateAsync` and `upsertAsync`:

```typescript
// Simplified internal implementation
async updateAsync(selector, modifier, options) {
  const relaxed = relaxSchema(this.schema);
  const parsed = await parseMongoModifierAsync(relaxed, modifier);
  return await this.collection.updateAsync(selector, parsed, options);
}
```

### `parseMongoOperationAsync`

```typescript
async function parseMongoOperationAsync<T extends z.ZodTypeAny>(
  schema: T,
  operation: any
): Promise<any>
```

Validates either a full document or an update modifier.

**Determines operation type:**
- If object has MongoDB operators (`$set`, etc.) → treats as modifier
- Otherwise → treats as full document

**Example:**

```typescript
import { parseMongoOperationAsync } from 'meteor/typed:model';

// Document
const doc = await parseMongoOperationAsync(UserSchema, {
  name: 'John',
  age: 30,
});

// Modifier
const modifier = await parseMongoOperationAsync(UserSchema, {
  $set: { name: 'Jane' },
});
```

**Use Cases:**
- Generic functions that accept either documents or modifiers
- Validation in custom hooks or middleware
- Testing schema validation

---

## Index Management

### The `addIndex` Method

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

### Basic Indexes

**Single field:**

```typescript
TaskModel.addIndex({ title: 1 }); // Ascending
TaskModel.addIndex({ createdAt: -1 }); // Descending
```

**Compound index:**

```typescript
TaskModel.addIndex({
  userId: 1,
  status: 1,
  createdAt: -1,
});
```

### Index Options

#### Unique Indexes

Ensures field value is unique across collection:

```typescript
UserModel.addIndex({ email: 1 }, { unique: true });

// Attempts to insert duplicate will fail
await UserModel.insertAsync({ email: 'john@example.com', ... }); // OK
await UserModel.insertAsync({ email: 'john@example.com', ... }); // Error: duplicate key
```

#### Sparse Indexes

Only indexes documents that have the field:

```typescript
UserModel.addIndex({ phoneNumber: 1 }, { sparse: true });

// Documents without phoneNumber won't be in index
// Allows multiple null values even with unique option
UserModel.addIndex(
  { phoneNumber: 1 },
  { unique: true, sparse: true }
);
```

#### Partial Indexes

Only indexes documents matching a filter:

```typescript
TaskModel.addIndex(
  { priority: 1 },
  {
    partialFilterExpression: {
      priority: { $exists: true },
      status: 'active',
    },
  }
);
// Only indexes active tasks with priority field
```

#### TTL Indexes

Automatically delete documents after a time period:

```typescript
SessionModel.addIndex(
  { createdAt: 1 },
  {
    expireAfterSeconds: 3600, // Delete after 1 hour
  }
);

LogModel.addIndex(
  { timestamp: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // Delete after 30 days
  }
);
```

### Text Indexes

For full-text search:

```typescript
PostModel.addIndex({
  title: 'text',
  content: 'text',
});

// Query with text search
const results = PostModel.find({
  $text: { $search: 'javascript tutorial' },
}).fetch();
```

### Geospatial Indexes

For location queries:

```typescript
LocationModel.addIndex({ coordinates: '2dsphere' });

// Query nearby locations
const nearby = LocationModel.find({
  coordinates: {
    $near: {
      $geometry: { type: 'Point', coordinates: [lng, lat] },
      $maxDistance: 5000, // 5km
    },
  },
}).fetch();
```

### Index Management Best Practices

**1. Create indexes during model definition:**

```typescript
const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

// Immediately after model creation
TaskModel.addIndex({ userId: 1, status: 1 });
TaskModel.addIndex({ createdAt: -1 });
TaskModel.addIndex({ dueDate: 1 }, { sparse: true });
```

**2. Use compound indexes for common queries:**

```typescript
// If you often query: { userId: X, status: Y }
TaskModel.addIndex({ userId: 1, status: 1 });

// Order matters! The above index can serve:
// - { userId: X }
// - { userId: X, status: Y }
// But NOT: { status: Y }
```

**3. Monitor index usage:**

```bash
# In MongoDB shell or Compass
db.tasks.getIndexes() // View all indexes
db.tasks.aggregate([{ $indexStats: {} }]) // Usage statistics
```

**4. Avoid redundant indexes:**

```typescript
// Redundant:
TaskModel.addIndex({ userId: 1 });
TaskModel.addIndex({ userId: 1, status: 1 });
// The second index serves both queries

// Keep only:
TaskModel.addIndex({ userId: 1, status: 1 });
```

---

## Bypassing Validation

### The `bypassSchema` Option

**Server-only**: Skip schema validation for an operation.

```typescript
if (Meteor.isServer) {
  await TaskModel.insertAsync(
    { /* potentially invalid data */ },
    { bypassSchema: true }
  );
}
```

### Use Cases

**1. Data Migration:**

```typescript
if (Meteor.isServer) {
  Meteor.startup(async () => {
    // Migrate legacy data that doesn't match current schema
    const legacyData = await OldCollection.find({}).fetch();

    for (const doc of legacyData) {
      await TaskModel.insertAsync(doc, { bypassSchema: true });
    }
  });
}
```

**2. System-Generated Data:**

```typescript
// Server-side background job
async function generateSystemReport() {
  await ReportModel.insertAsync(
    {
      type: 'system',
      data: complexComputedData,
      // May not match user-facing schema exactly
    },
    { bypassSchema: true }
  );
}
```

**3. Temporary Workarounds:**

```typescript
// During schema transition
if (Meteor.isServer) {
  await TaskModel.updateAsync(
    taskId,
    { $set: { newField: 'temp' } },
    { bypassSchema: true }
  );
}
```

### Security Considerations

**Client protection:**

```typescript
// Client-side: Will throw error
await TaskModel.insertAsync(doc, { bypassSchema: true });
// Error: "bypassSchema option is only available on the server"
```

**Why this protection exists:**
- Prevents malicious clients from bypassing validation
- Ensures client-side data always passes schema validation
- Maintains security even with direct collection access

**Best practice:** Use sparingly and document why validation is bypassed.

---

## Direct Collection Access

### The `collection` Property

```typescript
const collection: Mongo.Collection<DocumentType>
```

Direct access to the underlying `Mongo.Collection`.

### When to Use

**1. Collection-level operations:**

```typescript
// Create custom indexes
TaskModel.collection.createIndex({ customField: 1 });

// Get collection stats
const stats = await TaskModel.collection.rawCollection().stats();

// Aggregation
const results = await TaskModel.collection.rawCollection().aggregate([
  { $match: { status: 'active' } },
  { $group: { _id: '$userId', count: { $sum: 1 } } },
]).toArray();
```

**2. Methods not wrapped by Model:**

```typescript
// Bulk operations
const bulk = TaskModel.collection.rawCollection().initializeUnorderedBulkOp();
bulk.find({ status: 'old' }).update({ $set: { archived: true } });
await bulk.execute();

// Watch for changes
const changeStream = TaskModel.collection.rawCollection().watch();
changeStream.on('change', (change) => {
  console.log('Change detected:', change);
});
```

**3. Raw MongoDB access:**

```typescript
// Access raw MongoDB collection
const rawCollection = TaskModel.collection.rawCollection();

// Use MongoDB driver directly
const count = await rawCollection.countDocuments({ status: 'active' });
```

### Important Notes

**Allow/deny rules still apply:**

```typescript
// Both enforce the same rules:
await TaskModel.insertAsync(doc);
await TaskModel.collection.insertAsync(doc);
```

**Validation still applies:**

```typescript
// Both validate against schema (on client):
await TaskModel.insertAsync(invalidDoc); // ZodError
await TaskModel.collection.insertAsync(invalidDoc); // ZodError
```

**Server bypasses validation:**

```typescript
// Server-side code trusts you:
if (Meteor.isServer) {
  // No validation error (but allow/deny still enforced)
  await TaskModel.collection.insertAsync(invalidDoc);
}
```

---

## JSON Schema Generation

### Overview

`typed:model` converts Zod schemas to MongoDB JSON Schema format for database-level validation.

### Automatic Generation

JSON schemas are generated automatically when a Model is created on the server:

```typescript
// Your Zod schema
const TaskSchema = z.object({
  title: z.string().min(1).max(100),
  priority: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
});

// Automatically generates MongoDB JSON Schema:
{
  bsonType: 'object',
  required: ['title', 'priority', 'tags'],
  properties: {
    title: {
      bsonType: 'string',
      minLength: 1,
      maxLength: 100,
    },
    priority: {
      bsonType: 'int',
      minimum: 1,
      maximum: 5,
    },
    tags: {
      bsonType: 'array',
      items: { bsonType: 'string' },
    },
  },
}
```

### Supported Zod Types

| Zod Type | MongoDB BSON Type |
|----------|-------------------|
| `z.string()` | `string` |
| `z.number()` | `double` or `int` |
| `z.boolean()` | `bool` |
| `z.date()` | `date` |
| `z.array()` | `array` |
| `z.object()` | `object` |
| `z.enum()` | `string` with `enum` |
| `z.literal()` | `string`/`number`/`bool` with `enum` |
| `z.union()` | `anyOf` |
| `z.intersection()` | `allOf` |
| `z.record()` | `object` |
| `z.null()` | `null` |
| `uint8Array` | `binData` |

### Custom JSON Schema

For custom types, attach JSON schema metadata:

```typescript
import { attachCustomJsonSchema } from 'meteor/typed:model';

const customType = z.custom<MyType>();

attachCustomJsonSchema(customType, {
  bsonType: 'string',
  pattern: '^[A-Z]{3}$',
});
```

### Limitations

Some Zod features don't map to MongoDB JSON Schema:

- **Transforms**: Not representable in JSON Schema
- **Refinements**: Custom validation logic can't be expressed
- **Complex unions**: May not translate perfectly

For these cases, the generator does its best approximation.

---

## Global Model Registry

### The `AllModels` Set

```typescript
const AllModels: Set<Model<any, any>>
```

A global Set containing all Model instances created in your application.

### Use Cases

**1. Debugging:**

```typescript
console.log(`Total models: ${AllModels.size}`);

for (const model of AllModels) {
  console.log('Collection:', model.collection._name);
}
```

**2. Testing Cleanup:**

```typescript
async function clearAllCollections() {
  for (const model of AllModels) {
    await model.collection.removeAsync({});
  }
}
```

**3. Global Operations:**

```typescript
// Apply operation across all collections
async function backupAllCollections() {
  for (const model of AllModels) {
    const data = model.find({}).fetch();
    await saveToBackup(model.collection._name, data);
  }
}
```

**4. Model Discovery:**

```typescript
function getModelByName(name: string): Model<any, any> | undefined {
  return Array.from(AllModels).find(
    (m) => m.collection._name === name
  );
}

const TaskModel = getModelByName('tasks');
```

---

## Validation Behavior

### Client vs Server

**Client:**
- Full schema validation on all operations
- Allow/deny rules enforced
- `bypassSchema` throws error

**Server:**
- Schema validation in Model methods
- Direct collection access skips validation
- `bypassSchema` available
- Allow/deny rules still enforced for client-initiated operations

### Error Formatting

**Zod errors are converted to Meteor errors on client:**

```typescript
try {
  await TaskModel.insertAsync({ invalid: 'data' });
} catch (error) {
  console.log(error instanceof Meteor.Error); // true on client
  console.log(error.error); // 'validation-error'
  console.log(error.reason); // Human-readable message
  console.log(error.details); // Zod error details
}
```

### Validation Order

1. **Type coercion** (if using Zod coercion)
2. **Transform functions** (e.g., defaults)
3. **Validation rules** (min, max, regex, etc.)
4. **Custom refinements** (`.refine()`)
5. **Allow/deny rules** (client only)

---

## See Also

- [API Reference](API.md) - Model class documentation
- [Custom Types](CUSTOM_TYPES.md) - Pre-built types
- [Type System](TYPE_SYSTEM.md) - TypeScript inference
- [Best Practices](BEST_PRACTICES.md) - Recommended patterns
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
