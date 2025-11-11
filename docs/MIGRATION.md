# Migration Guide

Guide for migrating to `typed:model` from vanilla `Mongo.Collection` or `aldeed:collection2`.

## Table of Contents

- [From Vanilla Mongo.Collection](#from-vanilla-mongocollection)
  - [Overview](#overview)
  - [Step-by-Step Migration](#step-by-step-migration-from-vanilla)
  - [Code Examples](#code-examples-vanilla)
- [From aldeed:collection2](#from-aldeeds-collection2)
  - [Overview](#overview-1)
  - [Step-by-Step Migration](#step-by-step-migration-from-collection2)
  - [Schema Conversion](#schema-conversion)
  - [Code Examples](#code-examples-collection2)
- [Feature Comparison](#feature-comparison)
- [Common Migration Issues](#common-migration-issues)
- [Migration Checklist](#migration-checklist)

---

## From Vanilla Mongo.Collection

### Overview

Migrating from vanilla `Mongo.Collection` to `typed:model` adds:
- **Runtime validation** with Zod schemas
- **TypeScript type safety** with automatic type inference
- **Auto-populated fields** (timestamps, user tracking)
- **Client-side validation** with allow/deny rules

**Benefits:**
- Catch data errors before they reach the database
- Full IDE autocomplete and type checking
- Reduced boilerplate code
- Better security with automatic validation

---

### Step-by-Step Migration from Vanilla

#### Step 1: Install Dependencies

```bash
meteor add typed:model
meteor npm install zod
```

#### Step 2: Define Zod Schema

Create a Zod schema matching your existing data structure:

**Before (TypeScript interface):**

```typescript
interface Task {
  _id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: number;
  tags: string[];
  createdAt: Date;
  userId: string;
}
```

**After (Zod schema):**

```typescript
import { z } from 'zod';
import { CustomTypes, SchemaHelpers } from 'meteor/typed:model';

const { nonEmptyString, foreignKey } = CustomTypes;
const { withTimestamps } = SchemaHelpers;

const TaskSchema = withTimestamps(
  z.object({
    title: nonEmptyString,
    description: nonEmptyString.optional(),
    completed: z.boolean(),
    priority: z.number().int().min(1).max(5),
    tags: z.array(z.string()),
    userId: foreignKey,
  })
);
```

#### Step 3: Replace Collection with Model

**Before:**

```typescript
export const Tasks = new Mongo.Collection<Task>('tasks');
```

**After:**

```typescript
import { Model } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';

export const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

export type Task = ModelType<typeof TaskModel>;
```

#### Step 4: Update Queries

Most queries work identically, but use `async` methods:

**Before:**

```typescript
// Sync find
const tasks = Tasks.find({ userId }).fetch();

// Sync findOne
const task = Tasks.findOne(taskId);

// Reactive findOne
const task = Tasks.findOne(taskId); // In Tracker.autorun or template helper
```

**After:**

```typescript
// Same for reactive contexts
const tasks = TaskModel.find({ userId }).fetch();

// Async findOne (preferred in most cases)
const task = await TaskModel.findOneAsync(taskId);

// Sync findOne (for reactive contexts only)
const task = TaskModel.findOne(taskId); // In Tracker.autorun or template helper
```

#### Step 5: Update Insert Operations

Use `insertAsync`:

**Before:**

```typescript
const taskId = Tasks.insert({
  title: 'New Task',
  description: 'Task description',
  completed: false,
  priority: 1,
  tags: [],
  createdAt: new Date(),
  userId: Meteor.userId()!,
});
```

**After:**

```typescript
const taskId = await TaskModel.insertAsync({
  title: 'New Task',
  description: 'Task description',
  completed: false,
  priority: 1,
  tags: [],
  userId: Meteor.userId()!,
  // createdAt and updatedAt auto-populated if using withTimestamps
});
```

#### Step 6: Update Update Operations

Use MongoDB operators explicitly:

**Before:**

```typescript
Tasks.update(taskId, {
  $set: { completed: true },
});
```

**After:**

```typescript
await TaskModel.updateAsync(taskId, {
  $set: { completed: true },
});
```

#### Step 7: Update Remove Operations

**Before:**

```typescript
Tasks.remove(taskId);
```

**After:**

```typescript
await TaskModel.removeAsync(taskId);
```

#### Step 8: Add Allow/Deny Rules

**Before (with insecure package):**

```typescript
// Worked automatically with insecure package
```

**After:**

```typescript
// Remove insecure package first
// meteor remove insecure

TaskModel.allow({
  insert: (userId, doc) => {
    return userId !== null && doc.userId === userId;
  },
  update: (userId, doc) => {
    return userId !== null && doc.userId === userId;
  },
  remove: (userId, doc) => {
    return userId !== null && doc.userId === userId;
  },
});
```

---

### Code Examples (Vanilla)

#### Example 1: Simple CRUD

**Before:**

```typescript
// collections/tasks.ts
export const Tasks = new Mongo.Collection<Task>('tasks');

// Using
const taskId = Tasks.insert({ title: 'Task', completed: false });
const task = Tasks.findOne(taskId);
Tasks.update(taskId, { $set: { completed: true } });
Tasks.remove(taskId);
```

**After:**

```typescript
// models/Task.ts
const TaskSchema = z.object({
  title: nonEmptyString,
  completed: z.boolean(),
});

export const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

export type Task = ModelType<typeof TaskModel>;

// Using
const taskId = await TaskModel.insertAsync({ title: 'Task', completed: false });
const task = await TaskModel.findOneAsync(taskId);
await TaskModel.updateAsync(taskId, { $set: { completed: true } });
await TaskModel.removeAsync(taskId);
```

#### Example 2: With Auto-Populated Fields

**Before:**

```typescript
const Posts = new Mongo.Collection<Post>('posts');

// Manual tracking
const postId = Posts.insert({
  title: 'Post',
  content: 'Content',
  createdAt: new Date(),
  createdBy: Meteor.userId()!,
  updatedAt: new Date(),
});

Posts.update(postId, {
  $set: {
    title: 'Updated',
    updatedAt: new Date(),
  },
});
```

**After:**

```typescript
const PostSchema = withCommon(
  z.object({
    title: nonEmptyString,
    content: nonEmptyString,
  })
);

const PostModel = new Model({
  name: 'posts',
  schema: PostSchema,
});

// Auto-populated fields
const postId = await PostModel.insertAsync({
  title: 'Post',
  content: 'Content',
  // createdAt, updatedAt, createdBy, updatedBy auto-populated!
});

await PostModel.updateAsync(postId, {
  $set: { title: 'Updated' },
  // updatedAt and updatedBy automatically updated!
});
```

---

## From aldeed:collection2

### Overview

Both `aldeed:collection2` and `typed:model` provide schema validation for Meteor collections, but with different approaches:

**collection2:**
- Uses SimpleSchema
- Calls `attachSchema()` to add validation
- JavaScript-friendly

**typed:model:**
- Uses Zod schemas
- Wraps collection in Model class
- TypeScript-first with full type inference

**Migration Complexity:** Moderate - requires schema conversion and API changes.

---

### Step-by-Step Migration from collection2

#### Step 1: Install typed:model

```bash
meteor add typed:model
meteor npm install zod
```

You can keep `aldeed:collection2` installed during migration and remove it when done.

#### Step 2: Convert SimpleSchema to Zod

See [Schema Conversion](#schema-conversion) section below for detailed examples.

**SimpleSchema:**

```javascript
const TaskSchema = new SimpleSchema({
  title: {
    type: String,
    max: 200,
  },
  priority: {
    type: Number,
    allowedValues: [1, 2, 3, 4, 5],
  },
  tags: {
    type: Array,
    optional: true,
  },
  'tags.$': {
    type: String,
  },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) {
        return new Date();
      }
    },
  },
});
```

**Zod:**

```typescript
const TaskSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
  createdAt: createdTimestamp,
});
```

#### Step 3: Replace attachSchema with Model

**Before:**

```javascript
export const Tasks = new Mongo.Collection('tasks');
Tasks.attachSchema(TaskSchema);
```

**After:**

```typescript
export const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});
```

#### Step 4: Update Collection References

**Before:**

```javascript
import { Tasks } from './collections/tasks';

Tasks.insert({ ... });
Tasks.find({ ... });
```

**After:**

```typescript
import { TaskModel } from './models/Task';

await TaskModel.insertAsync({ ... });
TaskModel.find({ ... });
```

#### Step 5: Update Allow/Deny Rules

Allow/deny rules work the same way:

**Before and After (same):**

```typescript
TaskModel.allow({
  insert: (userId, doc) => userId !== null,
  update: (userId, doc) => userId !== null && doc.userId === userId,
  remove: (userId, doc) => userId !== null && doc.userId === userId,
});
```

---

### Schema Conversion

Common SimpleSchema patterns and their Zod equivalents:

#### Basic Types

| SimpleSchema | Zod |
|--------------|-----|
| `type: String` | `z.string().min(1)` or `nonEmptyString` |
| `type: Number` | `z.number()` |
| `type: Boolean` | `z.boolean()` |
| `type: Date` | `z.date()` |
| `type: Array` | `z.array(...)` |
| `type: Object` | `z.object({ ... })` |

#### Validation

| SimpleSchema | Zod |
|--------------|-----|
| `optional: true` | `.optional()` |
| `min: 1` | `.min(1)` |
| `max: 100` | `.max(100)` |
| `allowedValues: [...]` | `z.enum([...])` |
| `regEx: /pattern/` | `.regex(/pattern/)` |

#### Auto-Values

| SimpleSchema | Zod |
|--------------|-----|
| `autoValue` on insert | `createdTimestamp` |
| `autoValue` on insert/update | `updatedTimestamp` |
| Custom `autoValue` | Custom transform or `CustomTypes` |

#### Complex Examples

**1. Optional String with Max Length**

**SimpleSchema:**
```javascript
name: {
  type: String,
  optional: true,
  max: 100,
}
```

**Zod:**
```typescript
name: nonEmptyString.max(100).optional()
```

**2. Array of Objects**

**SimpleSchema:**
```javascript
comments: {
  type: Array,
  optional: true,
},
'comments.$': {
  type: Object,
},
'comments.$.author': {
  type: String,
},
'comments.$.text': {
  type: String,
},
'comments.$.createdAt': {
  type: Date,
},
```

**Zod:**
```typescript
comments: z.array(
  z.object({
    author: nonEmptyString,
    text: nonEmptyString,
    createdAt: z.date(),
  })
).optional()
```

**3. Enum/Allowed Values**

**SimpleSchema:**
```javascript
status: {
  type: String,
  allowedValues: ['pending', 'active', 'completed'],
  defaultValue: 'pending',
}
```

**Zod:**
```typescript
status: z.enum(['pending', 'active', 'completed']).default('pending')
```

**4. Auto-Populated Timestamps**

**SimpleSchema:**
```javascript
createdAt: {
  type: Date,
  autoValue() {
    if (this.isInsert) {
      return new Date();
    }
  },
},
updatedAt: {
  type: Date,
  autoValue() {
    return new Date();
  },
}
```

**Zod:**
```typescript
import { createdTimestamp, updatedTimestamp } from 'meteor/typed:model';

// Or use helper
import { withTimestamps } from 'meteor/typed:model';

const schema = withTimestamps(
  z.object({
    // your fields
  })
);
```

---

### Code Examples (collection2)

#### Complete Migration Example

**Before (collection2):**

```javascript
// collections/posts.js
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

export const Posts = new Mongo.Collection('posts');

const PostSchema = new SimpleSchema({
  title: {
    type: String,
    max: 200,
  },
  content: {
    type: String,
  },
  authorId: {
    type: String,
    regEx: SimpleSchema.RegEx.Id,
  },
  published: {
    type: Boolean,
    defaultValue: false,
  },
  tags: {
    type: Array,
    optional: true,
  },
  'tags.$': {
    type: String,
  },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) return new Date();
    },
  },
  updatedAt: {
    type: Date,
    autoValue() {
      return new Date();
    },
  },
});

Posts.attachSchema(PostSchema);

// Allow/deny
Posts.allow({
  insert: (userId, doc) => userId !== null && doc.authorId === userId,
  update: (userId, doc) => userId !== null && doc.authorId === userId,
  remove: (userId, doc) => userId !== null && doc.authorId === userId,
});
```

**After (typed:model):**

```typescript
// models/Post.ts
import { Model, CustomTypes, SchemaHelpers } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString, foreignKey } = CustomTypes;
const { withTimestamps } = SchemaHelpers;

const PostSchema = withTimestamps(
  z.object({
    title: nonEmptyString.max(200),
    content: nonEmptyString,
    authorId: foreignKey,
    published: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
  })
);

export const PostModel = new Model({
  name: 'posts',
  schema: PostSchema,
});

export type Post = ModelType<typeof PostModel>;

// Allow/deny (same as before!)
PostModel.allow({
  insert: (userId, doc) => userId !== null && doc.authorId === userId,
  update: (userId, doc) => userId !== null && doc.authorId === userId,
  remove: (userId, doc) => userId !== null && doc.authorId === userId,
});
```

---

## Feature Comparison

| Feature | Vanilla Collection | collection2 | typed:model |
|---------|-------------------|-------------|-------------|
| **Runtime Validation** | ❌ No | ✅ Yes (SimpleSchema) | ✅ Yes (Zod) |
| **TypeScript Types** | ⚠️ Manual | ⚠️ Limited | ✅ Full inference |
| **Auto-populated Fields** | ❌ Manual | ⚠️ autoValue | ✅ Built-in types |
| **Field Projection Types** | ❌ No | ❌ No | ✅ Yes |
| **Client Validation** | ❌ No | ✅ Yes | ✅ Yes |
| **Allow/Deny** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Async Methods** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Schema Language** | - | SimpleSchema | Zod |
| **Package Size** | Small | Medium | Medium |
| **Learning Curve** | Low | Medium | Medium |

**Legend:**
- ✅ Full support
- ⚠️ Partial support
- ❌ Not supported

---

## Common Migration Issues

### Issue 1: Empty Strings

**Problem:** collection2 allows empty strings by default, typed:model doesn't.

**Solution:**

```typescript
// If you need empty strings
import { allowedEmptyString } from 'meteor/typed:model';

const schema = z.object({
  notes: allowedEmptyString, // Explicitly allows ""
});
```

### Issue 2: Async Everywhere

**Problem:** typed:model uses async methods, requiring `await`.

**Solution:**

```typescript
// Before
const task = Tasks.findOne(taskId);

// After
const task = await TaskModel.findOneAsync(taskId);

// Or in reactive contexts
const task = TaskModel.findOne(taskId); // Still sync
```

### Issue 3: Full Document Updates

**Problem:** SimpleSchema allowed full document replacement in updates.

**Solution:**

```typescript
// Before (collection2 allowed this)
Tasks.update(taskId, { title: 'New', completed: true });

// After (must use operators)
await TaskModel.updateAsync(taskId, {
  $set: { title: 'New', completed: true },
});
```

### Issue 4: Type Imports

**Problem:** Need to import types separately.

**Solution:**

```typescript
// Import type separately
import { TaskModel } from './models/Task';
import type { Task } from './models/Task';

// Or use ModelType
import type { ModelType } from 'meteor/typed:model';
type Task = ModelType<typeof TaskModel>;
```

### Issue 5: Schema Composition

**Problem:** SimpleSchema uses `extend()`, Zod uses different methods.

**Solution:**

```typescript
// SimpleSchema
const BaseSchema = new SimpleSchema({ ... });
const ExtendedSchema = new SimpleSchema({});
ExtendedSchema.extend(BaseSchema);

// Zod
const BaseSchema = z.object({ ... });
const ExtendedSchema = BaseSchema.extend({ ... });
// Or
const ExtendedSchema = BaseSchema.and(z.object({ ... }));
```

---

## Migration Checklist

### Pre-Migration

- [ ] Review current schema definitions
- [ ] Document custom validation logic
- [ ] List all collections to migrate
- [ ] Backup database
- [ ] Set up TypeScript (if not already using it)

### Migration

- [ ] Install `typed:model` and `zod`
- [ ] Convert schemas to Zod
- [ ] Create Model instances
- [ ] Update insert operations to `insertAsync`
- [ ] Update update operations to `updateAsync`
- [ ] Update remove operations to `removeAsync`
- [ ] Update findOne to `findOneAsync` (where appropriate)
- [ ] Add allow/deny rules
- [ ] Update TypeScript types
- [ ] Test all CRUD operations

### Post-Migration

- [ ] Remove old collection definitions
- [ ] Remove `aldeed:collection2` (if migrating from it)
- [ ] Run full test suite
- [ ] Update documentation
- [ ] Deploy to staging
- [ ] Monitor for validation errors
- [ ] Deploy to production

---

## See Also

- [API Reference](API.md) - Complete API documentation
- [Custom Types](CUSTOM_TYPES.md) - Pre-built types
- [Schema Helpers](SCHEMA_HELPERS.md) - Schema composition
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
- [Best Practices](BEST_PRACTICES.md) - Recommended patterns
