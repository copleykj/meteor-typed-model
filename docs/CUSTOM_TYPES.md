# Custom Types

Pre-built Zod types with automatic behavior for common database patterns.

## Table of Contents

- [String Types](#string-types)
  - [nonEmptyString](#nonemptystring)
  - [allowedEmptyString](#allowedemptystring)
- [ID Types](#id-types)
  - [stringId](#stringid)
  - [foreignKey](#foreignkey)
  - [snowflake](#snowflake)
- [Timestamp Types](#timestamp-types)
  - [createdTimestamp](#createdtimestamp)
  - [updatedTimestamp](#updatedtimestamp)
- [User Tracking Types](#user-tracking-types)
  - [createdUser](#createduser)
  - [updatedUser](#updateduser)
- [Other Types](#other-types)
  - [deleted](#deleted)
  - [uint8Array](#uint8array)
  - [portNumber](#portnumber)
- [Advanced: Context Variables](#advanced-context-variables)
  - [IsInsert, IsUpdate, IsUpsert](#isinsert-isupdate-isupsert)
- [Testing Utilities](#testing-utilities)
  - [setClock, resetClock](#setclock-resetclock)

---

## String Types

### `nonEmptyString`

```typescript
const nonEmptyString: z.ZodString
```

A string type that requires at least one character.

**Validation:**
- Must be a string
- Must have `length >= 1`
- Rejects empty strings (`""`)

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString,
  description: nonEmptyString,
});

// Valid
TaskModel.insertAsync({ title: 'Task', description: 'Details' }); // ✓

// Invalid
TaskModel.insertAsync({ title: '', description: 'Details' }); // ✗ ZodError
```

**Use Case:** Most string fields in your schemas to prevent empty values.

**Note:** This is the default string type you should use. See [`allowedEmptyString`](#allowedemptystring) if you explicitly want to allow empty strings.

---

### `allowedEmptyString`

```typescript
const allowedEmptyString: z.ZodString
```

A string type that explicitly allows empty strings. Used to bypass the package's default empty string validation policy.

**Validation:**
- Must be a string
- Allows empty strings (`""`)

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { nonEmptyString, allowedEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString, // Must not be empty
  notes: allowedEmptyString, // Can be empty
  tags: z.array(nonEmptyString), // Array of non-empty strings
});

// Valid
TaskModel.insertAsync({
  title: 'Task',
  notes: '', // Empty is OK for this field
  tags: ['urgent'],
}); // ✓
```

**Use Case:** Optional text fields where empty strings are meaningful (e.g., cleared notes, empty comments).

**Why It Exists:** The package enforces a policy that `z.string()` fields should not accept empty strings by default. Use `allowedEmptyString` to explicitly opt out of this policy for specific fields.

---

## ID Types

### `stringId`

```typescript
const stringId: z.ZodString
```

Auto-generated MongoDB document ID. Used as the default `_id` field type.

**Behavior:**
- **On insert**: Automatically generates a random ID using Meteor's `Random.id()`
- **Output type**: Always `string` (never `undefined`)
- **Input type**: `string | undefined` (optional on input)

**Format:**
- Matches the pattern: `[a-zA-Z0-9]{17}`
- Example: `"aBc123XyZ456eDf78"`

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { stringId, nonEmptyString } = CustomTypes;

const schema = z.object({
  _id: stringId, // Auto-generated
  title: nonEmptyString,
});

// Don't provide _id - it's auto-generated
const id = await TaskModel.insertAsync({ title: 'Task' });
console.log(id); // "aBc123XyZ456eDf78"

// Can also provide your own _id if needed
await TaskModel.insertAsync({
  _id: 'my-custom-id-1234',
  title: 'Task',
});
```

**Use Case:** Default `_id` field for all models (automatically included by Model class).

**Note:** You typically don't need to explicitly include `stringId` in your schema - the Model class handles this for you. However, you can use a custom `idSchema` in the Model constructor if you need different ID behavior (e.g., UUIDs).

---

### `foreignKey`

```typescript
const foreignKey: z.ZodString
```

Reference to another document's ID.

**Validation:**
- Must be a string
- Must match MongoDB ID pattern: `[a-zA-Z0-9]{17}`

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { foreignKey, nonEmptyString } = CustomTypes;

const CommentSchema = z.object({
  postId: foreignKey, // References a Post document
  authorId: foreignKey, // References a User document
  text: nonEmptyString,
});

// Valid
await CommentModel.insertAsync({
  postId: 'aBc123XyZ456eDf78',
  authorId: 'xYz789AbC123dEf45',
  text: 'Great post!',
});

// Invalid
await CommentModel.insertAsync({
  postId: 'invalid-id', // ✗ Doesn't match pattern
  authorId: userId,
  text: 'Great post!',
});
```

**Use Case:** Foreign key relationships between collections.

**Best Practice:** Name foreign key fields with an `Id` suffix for clarity: `userId`, `postId`, `teamId`, etc.

---

### `snowflake`

```typescript
const snowflake: z.ZodString
```

Twitter/Discord-style Snowflake ID (numeric string).

**Validation:**
- Must be a string
- Must contain only digits: `[0-9]+`

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { snowflake, nonEmptyString } = CustomTypes;

const ExternalResourceSchema = z.object({
  discordId: snowflake,
  twitterId: snowflake.optional(),
  name: nonEmptyString,
});

// Valid
await ResourceModel.insertAsync({
  discordId: '123456789012345678',
  twitterId: '987654321098765432',
  name: 'Resource',
});

// Invalid
await ResourceModel.insertAsync({
  discordId: 'abc123', // ✗ Contains non-digits
  name: 'Resource',
});
```

**Use Case:** Storing IDs from external systems that use numeric string IDs (Discord, Twitter, some APIs).

---

## Timestamp Types

Timestamp types automatically manage creation and update times for your documents.

### `createdTimestamp`

```typescript
const createdTimestamp: z.ZodDate
```

Automatically set to the current date/time when a document is inserted.

**Behavior:**
- **On insert**: Automatically set to `new Date()`
- **On update**: Field is not modified
- **Output type**: Always `Date` (never `undefined`)

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { createdTimestamp, nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString,
  createdAt: createdTimestamp,
});

// Don't provide createdAt - it's auto-populated
const id = await TaskModel.insertAsync({
  title: 'Task',
  // createdAt: new Date(), // Not needed!
});

const task = await TaskModel.findOneAsync(id);
console.log(task.createdAt); // Date object (time of insert)

// Update doesn't change createdAt
await TaskModel.updateAsync(id, {
  $set: { title: 'Updated' },
});

const updated = await TaskModel.findOneAsync(id);
console.log(updated.createdAt); // Same as before
```

**Use Case:** Tracking when documents were created.

**Common Field Names:** `createdAt`, `created`, `insertedAt`

**See Also:** [`withTimestamps`](SCHEMA_HELPERS.md#withtimestamps) to add both creation and update timestamps automatically.

---

### `updatedTimestamp`

```typescript
const updatedTimestamp: z.ZodDate
```

Automatically set to the current date/time when a document is inserted or updated.

**Behavior:**
- **On insert**: Set to `new Date()`
- **On update**: Set to `new Date()`
- **On upsert**: Set to `new Date()`
- **Output type**: Always `Date` (never `undefined`)

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { updatedTimestamp, nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString,
  updatedAt: updatedTimestamp,
});

// Insert: updatedAt is set automatically
const id = await TaskModel.insertAsync({
  title: 'Task',
});

const task = await TaskModel.findOneAsync(id);
console.log(task.updatedAt); // Date (time of insert)

// Update: updatedAt is updated automatically
await TaskModel.updateAsync(id, {
  $set: { title: 'Updated Task' },
});

const updated = await TaskModel.findOneAsync(id);
console.log(updated.updatedAt); // Date (time of update, newer than createdAt)
```

**Use Case:** Tracking the last modification time of documents.

**Common Field Names:** `updatedAt`, `updated`, `modifiedAt`, `lastModified`

**See Also:** [`withTimestamps`](SCHEMA_HELPERS.md#withtimestamps) to add both creation and update timestamps automatically.

---

## User Tracking Types

User tracking types automatically record which user created or modified a document.

### `createdUser`

```typescript
const createdUser: z.ZodString
```

Automatically set to the current user's ID when a document is inserted.

**Behavior:**
- **On insert**: Set to `Meteor.userId()` (the currently logged-in user)
- **On update**: Field is not modified
- **Output type**: Always `string` (never `undefined`)
- **When no user**: Sets to `null` if no user is logged in

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { createdUser, nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString,
  createdBy: createdUser,
});

// Don't provide createdBy - it's auto-populated from Meteor.userId()
const id = await TaskModel.insertAsync({
  title: 'My Task',
  // createdBy: Meteor.userId(), // Not needed!
});

const task = await TaskModel.findOneAsync(id);
console.log(task.createdBy); // Current user's ID

// Update doesn't change createdBy
await TaskModel.updateAsync(id, {
  $set: { title: 'Updated' },
});
```

**Use Case:** Tracking who created each document for ownership and auditing.

**Common Field Names:** `createdBy`, `userId`, `authorId`, `ownerId`

**Security Pattern:**

```typescript
// Only allow users to insert their own documents
TaskModel.allow({
  insert: (userId, doc) => {
    return userId !== null && doc.createdBy === userId;
  },
});
```

**See Also:** [`withUsers`](SCHEMA_HELPERS.md#withusers) to add both creator and updater tracking automatically.

---

### `updatedUser`

```typescript
const updatedUser: z.ZodString
```

Automatically set to the current user's ID when a document is inserted or updated.

**Behavior:**
- **On insert**: Set to `Meteor.userId()`
- **On update**: Set to `Meteor.userId()`
- **Output type**: `string | undefined`
- **When no user**: Sets to `undefined` if no user is logged in

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { updatedUser, nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString,
  updatedBy: updatedUser,
});

// Insert: updatedBy is set to current user
const id = await TaskModel.insertAsync({
  title: 'Task',
});

const task = await TaskModel.findOneAsync(id);
console.log(task.updatedBy); // Current user's ID

// Update: updatedBy is updated to current user
// (useful if a different user edits it)
await TaskModel.updateAsync(id, {
  $set: { title: 'Updated Task' },
});

const updated = await TaskModel.findOneAsync(id);
console.log(updated.updatedBy); // ID of user who performed update
```

**Use Case:** Tracking who last modified each document for auditing and collaboration.

**Common Field Names:** `updatedBy`, `lastModifiedBy`, `modifiedBy`

**See Also:** [`withUsers`](SCHEMA_HELPERS.md#withusers) to add both creator and updater tracking automatically.

---

## Other Types

### `deleted`

```typescript
const deleted: z.ZodBoolean
```

Boolean flag for soft deletion with a default value of `false`.

**Behavior:**
- **Default**: `false` (document not deleted)
- **On insert**: Defaults to `false` if not provided
- **Output type**: Always `boolean`

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { deleted, nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString,
  deleted,
});

// Insert without deleted field - defaults to false
const id = await TaskModel.insertAsync({
  title: 'Task',
});

const task = await TaskModel.findOneAsync(id);
console.log(task.deleted); // false

// Soft delete: mark as deleted instead of removing
await TaskModel.updateAsync(id, {
  $set: { deleted: true },
});

// Query non-deleted documents
const activeTasks = TaskModel.find({ deleted: false }).fetch();

// Query deleted documents (e.g., for trash/recycle bin)
const deletedTasks = TaskModel.find({ deleted: true }).fetch();
```

**Use Case:** Soft deletion pattern where you mark records as deleted instead of removing them from the database.

**Benefits:**
- Reversible deletion (can undelete)
- Maintain referential integrity
- Keep audit trail
- Implement "trash" or "recycle bin" features

**Pattern: Soft Delete Method**

```typescript
async function softDelete(taskId: string) {
  await TaskModel.updateAsync(taskId, {
    $set: { deleted: true },
  });
}

async function restore(taskId: string) {
  await TaskModel.updateAsync(taskId, {
    $set: { deleted: false },
  });
}
```

---

### `uint8Array`

```typescript
const uint8Array: z.ZodType<Uint8Array>
```

Binary data type mapped to MongoDB's `binData` BSON type.

**Validation:**
- Must be a `Uint8Array` instance

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { uint8Array, nonEmptyString } = CustomTypes;

const FileSchema = z.object({
  filename: nonEmptyString,
  mimeType: z.string(),
  data: uint8Array,
  size: z.number().int().positive(),
});

// Valid
const fileData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
await FileModel.insertAsync({
  filename: 'image.png',
  mimeType: 'image/png',
  data: fileData,
  size: fileData.length,
});

// Read file
const file = await FileModel.findOneAsync(fileId);
console.log(file.data); // Uint8Array
```

**Use Case:** Storing binary data like images, files, or encrypted content.

**Note:** For large files, consider using GridFS or external storage (S3, etc.) and storing only a reference in your document.

---

### `portNumber`

```typescript
const portNumber: z.ZodNumber
```

Valid network port number (1-65535).

**Validation:**
- Must be an integer
- Must be positive
- Must be ≤ 65535

**Example:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { portNumber, nonEmptyString } = CustomTypes;

const ServerSchema = z.object({
  hostname: nonEmptyString,
  port: portNumber,
  protocol: z.enum(['http', 'https']),
});

// Valid
await ServerModel.insertAsync({
  hostname: 'example.com',
  port: 8080,
  protocol: 'https',
}); // ✓

// Invalid
await ServerModel.insertAsync({
  hostname: 'example.com',
  port: 70000, // ✗ Too large
  protocol: 'https',
});

await ServerModel.insertAsync({
  hostname: 'example.com',
  port: -1, // ✗ Negative
  protocol: 'https',
});

await ServerModel.insertAsync({
  hostname: 'example.com',
  port: 80.5, // ✗ Not an integer
  protocol: 'https',
});
```

**Use Case:** Server configurations, proxy settings, network services.

**Common Port Ranges:**
- 1-1023: Well-known ports (require root on Unix)
- 1024-49151: Registered ports
- 49152-65535: Dynamic/private ports

---

## Advanced: Context Variables

These are advanced features used internally to track the operation context. You typically won't need these unless you're building custom types with context-aware transforms.

### `IsInsert`, `IsUpdate`, `IsUpsert`

```typescript
const IsInsert: Meteor.EnvironmentVariable<boolean>
const IsUpdate: Meteor.EnvironmentVariable<boolean>
const IsUpsert: Meteor.EnvironmentVariable<boolean>
```

Environment variables that track the current operation context during schema validation.

**Behavior:**
- **Mutually exclusive**: Only one can be `true` at a time
- **Set by Model class**: Automatically managed during operations
- **Used by Custom Types**: Enable context-aware transforms

**Values:**
- `IsInsert`: `true` during `insertAsync()`
- `IsUpdate`: `true` during `updateAsync()` (including `$set` operations)
- `IsUpsert`: `true` during `upsertAsync()`

**Example: Custom Context-Aware Type**

```typescript
import { IsInsert, IsUpdate } from 'meteor/typed:model';

// Custom type that only sets value on insert
const createdTimestamp = z.date().optional().transform((v) => {
  if (v) return v; // Use provided value
  if (IsInsert.getOrNullIfOutsideFiber()) {
    return new Date(); // Auto-set on insert
  }
  return undefined; // Don't modify on update
});

// Custom type that sets value on insert and update
const updatedTimestamp = z.date().optional().transform((v) => {
  if (v) return v;
  if (IsInsert.getOrNullIfOutsideFiber() || IsUpdate.getOrNullIfOutsideFiber()) {
    return new Date(); // Auto-set on both insert and update
  }
  return undefined;
});
```

**Use Case:**
- Building custom auto-populated fields
- Different validation behavior based on operation
- Advanced timestamp or user tracking

**Note:** These variables are used internally by `createdTimestamp`, `updatedTimestamp`, `createdUser`, and `updatedUser`. You typically don't need to use them directly unless you're building custom types.

---

## Testing Utilities

### `setClock`, `resetClock`

```typescript
function setClock(newClock: () => Date): void
function resetClock(): void
```

Override the clock used by timestamp types for testing.

**Example:**

```typescript
import { setClock, resetClock } from 'meteor/typed:model';

// In your test
describe('Task timestamps', () => {
  const fixedDate = new Date('2024-01-01T00:00:00Z');

  beforeEach(() => {
    setClock(() => fixedDate); // Use fixed date
  });

  afterEach(() => {
    resetClock(); // Reset to real Date()
  });

  it('sets predictable timestamps', async () => {
    const id = await TaskModel.insertAsync({
      title: 'Test Task',
    });

    const task = await TaskModel.findOneAsync(id);
    expect(task.createdAt).toEqual(fixedDate); // Predictable!
  });
});
```

**Use Case:**
- Testing timestamp-dependent logic
- Ensuring predictable test results
- Simulating specific times

**Important:** Always call `resetClock()` in cleanup (e.g., `afterEach`) to avoid affecting other tests.

---

## Quick Reference

| Type | Purpose | Auto-Populated | Default |
|------|---------|----------------|---------|
| `nonEmptyString` | Non-empty string | No | - |
| `allowedEmptyString` | String (can be empty) | No | - |
| `stringId` | MongoDB ID | Yes (on insert) | - |
| `foreignKey` | Reference to another doc | No | - |
| `snowflake` | Numeric string ID | No | - |
| `createdTimestamp` | Creation time | Yes (on insert) | - |
| `updatedTimestamp` | Last update time | Yes (insert/update) | - |
| `createdUser` | Creator user ID | Yes (on insert) | - |
| `updatedUser` | Last updater user ID | Yes (insert/update) | - |
| `deleted` | Soft delete flag | No | `false` |
| `uint8Array` | Binary data | No | - |
| `portNumber` | Network port (1-65535) | No | - |

---

## See Also

- [Schema Helpers](SCHEMA_HELPERS.md) - Combine multiple custom types easily
- [API Reference](API.md) - Model class methods
- [Best Practices](BEST_PRACTICES.md) - Recommended patterns
