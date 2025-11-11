# Best Practices

Recommended patterns, performance tips, and security best practices for `typed:model`.

## Table of Contents

- [Schema Design](#schema-design)
- [Performance Optimization](#performance-optimization)
- [Security Best Practices](#security-best-practices)
- [Index Strategy](#index-strategy)
- [Code Organization](#code-organization)
- [Error Handling](#error-handling)
- [Testing Strategies](#testing-strategies)
- [Client-Side Patterns](#client-side-patterns)
- [Server-Side Patterns](#server-side-patterns)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Real-World Examples](#real-world-examples)

---

## Schema Design

### Use Schema Helpers

**Prefer schema helpers for common patterns:**

```typescript
// ✓ Good: Use withCommon for typical user-generated content
const PostSchema = withCommon(
  z.object({
    title: nonEmptyString,
    content: nonEmptyString,
  })
);
// Adds: createdAt, updatedAt, createdBy, updatedBy

// ✗ Avoid: Manually adding these fields everywhere
const PostSchema = z.object({
  title: nonEmptyString,
  content: nonEmptyString,
  createdAt: createdTimestamp,
  updatedAt: updatedTimestamp,
  createdBy: createdUser,
  updatedBy: updatedUser,
});
```

### Keep Schemas Focused

**One responsibility per schema:**

```typescript
// ✓ Good: Focused schemas
const UserProfileSchema = z.object({
  displayName: nonEmptyString,
  avatar: z.string().url().optional(),
  bio: nonEmptyString.optional(),
});

const UserSettingsSchema = z.object({
  theme: z.enum(['light', 'dark']),
  notifications: z.boolean(),
});

const UserSchema = z.object({
  email: z.string().email(),
  profile: UserProfileSchema,
  settings: UserSettingsSchema,
});

// ✗ Avoid: Everything in one flat schema
const UserSchema = z.object({
  email: z.string().email(),
  displayName: nonEmptyString,
  avatar: z.string().url().optional(),
  bio: nonEmptyString.optional(),
  theme: z.enum(['light', 'dark']),
  notifications: z.boolean(),
  // ... 50 more fields
});
```

### Use Descriptive Field Names

```typescript
// ✓ Good: Clear, descriptive names
const TaskSchema = z.object({
  title: nonEmptyString,
  assignedUserId: foreignKey.optional(),
  completedAt: z.date().optional(),
  isArchived: z.boolean().default(false),
});

// ✗ Avoid: Abbreviations and unclear names
const TaskSchema = z.object({
  t: nonEmptyString, // What is 't'?
  uid: foreignKey.optional(), // User ID? Unique ID?
  cmpltd: z.date().optional(), // Hard to read
  arch: z.boolean().default(false), // Ambiguous
});
```

### Provide Defaults for Optional Fields

```typescript
// ✓ Good: Clear defaults
const TaskSchema = z.object({
  priority: z.number().int().min(1).max(5).default(3),
  status: z.enum(['pending', 'active', 'completed']).default('pending'),
  tags: z.array(z.string()).default([]),
});

// ✗ Avoid: All optional without defaults
const TaskSchema = z.object({
  priority: z.number().int().min(1).max(5).optional(),
  status: z.enum(['pending', 'active', 'completed']).optional(),
  tags: z.array(z.string()).optional(),
});
// Forces null checks everywhere: if (task.priority !== undefined) ...
```

### Validate at Schema Level

**Put validation in schema, not in application code:**

```typescript
// ✓ Good: Validation in schema
const UserSchema = z.object({
  age: z.number().int().min(13).max(120),
  email: z.string().email(),
  password: z.string().min(8),
}).refine((data) => data.password.length >= 8, {
  message: 'Password must be at least 8 characters',
});

// ✗ Avoid: Validation scattered in application code
const UserSchema = z.object({
  age: z.number(),
  email: z.string(),
  password: z.string(),
});

// Then checking everywhere:
if (user.age < 13 || user.age > 120) throw new Error('Invalid age');
if (!isValidEmail(user.email)) throw new Error('Invalid email');
```

---

## Performance Optimization

### Use Field Projections

**Fetch only what you need:**

```typescript
// ✓ Good: Project only needed fields
const users = await UserModel.find(
  {},
  {
    fields: { name: 1, email: 1 },
    limit: 20,
  }
).fetch();

// ✗ Avoid: Fetching all fields when you only need a few
const users = await UserModel.find({}, { limit: 20 }).fetch();
users.forEach((user) => console.log(user.name, user.email));
```

### Create Appropriate Indexes

**Index frequently queried fields:**

```typescript
// ✓ Good: Index commonly queried fields
TaskModel.addIndex({ userId: 1, status: 1 });
TaskModel.addIndex({ createdAt: -1 });

// Query benefits from index
const tasks = TaskModel.find({
  userId,
  status: 'active',
}).fetch();

// ✗ Avoid: No indexes on queried fields
// Every query does a collection scan - very slow!
```

### Batch Operations on Server

**Bulk operations are faster:**

```typescript
// ✓ Good: Batch inserts on server
if (Meteor.isServer) {
  const bulk = TaskModel.collection.rawCollection().initializeUnorderedBulkOp();

  largeDataset.forEach((item) => {
    bulk.insert(item);
  });

  await bulk.execute();
}

// ✗ Avoid: Individual inserts in loop
for (const item of largeDataset) {
  await TaskModel.insertAsync(item); // Slow!
}
```

### Limit Query Results

**Always limit large queries:**

```typescript
// ✓ Good: Reasonable limits
const recentTasks = TaskModel.find(
  {},
  {
    sort: { createdAt: -1 },
    limit: 50,
  }
).fetch();

// ✗ Avoid: Unbounded queries
const allTasks = TaskModel.find({}).fetch(); // Could be millions!
```

### Use Pagination

```typescript
// ✓ Good: Paginated queries
const pageSize = 20;
const page = 1;

const tasks = TaskModel.find(
  { userId },
  {
    sort: { createdAt: -1 },
    limit: pageSize,
    skip: (page - 1) * pageSize,
  }
).fetch();

const totalCount = TaskModel.find({ userId }).count();
const totalPages = Math.ceil(totalCount / pageSize);
```

### Optimize Reactive Queries

**Minimize reactive query surface:**

```typescript
// ✓ Good: Specific reactive queries
const userTasks = TaskModel.find({
  userId,
  status: 'active',
}, {
  fields: { title: 1, status: 1 },
  limit: 10,
}).fetch();

// ✗ Avoid: Overly broad reactive queries
const allData = TaskModel.find({}).fetch(); // Reruns on ANY change!
```

---

## Security Best Practices

### Always Define Allow/Deny Rules

**After removing `insecure` package:**

```typescript
// ✓ Good: Explicit allow rules
TaskModel.allow({
  insert: (userId, doc) => {
    // Only logged-in users can insert
    // And only their own tasks
    return userId !== null && doc.userId === userId;
  },
  update: (userId, doc) => {
    // Only owner can update
    return userId !== null && doc.userId === userId;
  },
  remove: (userId, doc) => {
    // Only owner can remove
    return userId !== null && doc.userId === userId;
  },
});

// ✗ Avoid: Permissive rules or no rules
TaskModel.allow({
  insert: () => true, // Anyone can insert anything!
  update: () => true, // Anyone can update anything!
  remove: () => true, // Anyone can remove anything!
});
```

### Protect Sensitive Fields with `denyUntrusted`

**Best approach: Use `denyUntrusted` at schema level:**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { denyUntrusted, nonEmptyString } = CustomTypes;

// ✓ Best: Protect at schema level
const UserSchema = z.object({
  username: nonEmptyString,
  email: nonEmptyString,

  // Security-sensitive fields automatically protected from ALL client modifications
  isAdmin: denyUntrusted(z.boolean().default(false)),
  role: denyUntrusted(z.enum(['user', 'moderator', 'admin']).default('user')),
  permissions: denyUntrusted(z.array(nonEmptyString).default([])),
  apiKey: denyUntrusted(nonEmptyString.optional()),
});

const Users = new Model({ name: 'users', schema: UserSchema });

// No additional deny rules needed - denyUntrusted handles it!
// Client cannot set these fields in insert/update operations
// Server code can freely modify them
```

**Alternative: Custom deny rules for conditional protection:**

```typescript
// ✓ Good: Use deny rules when protection is conditional
TaskModel.deny({
  update: (userId, doc, fieldNames) => {
    // Prevent changing ownership
    return fieldNames.includes('userId');
  },
});

UserModel.deny({
  update: (userId, doc, fieldNames) => {
    // Only admins can change roles (conditional protection)
    const protectedFields = ['role', 'permissions'];
    return protectedFields.some((field) => fieldNames.includes(field))
      && !Roles.userIsInRole(userId, 'admin');
  },
});
```

**When to use each approach:**

| Approach | Use When |
|----------|----------|
| `denyUntrusted` | Field should **never** be modified by client code |
| Custom `deny()` | Protection depends on **user roles** or **other conditions** |

**Common fields to protect with `denyUntrusted`:**
- Authorization flags: `isAdmin`, `isVerified`, `isBanned`
- Role/permission fields: `role`, `permissions`, `accessLevel`
- System metadata: `internalId`, `flags`, `status`
- API credentials: `apiKey`, `secretToken`
- Audit fields: Automatically protected when using `withCommon`, `withTimestamps`, or `withUsers`

**See:** [Custom Types - denyUntrusted](CUSTOM_TYPES.md#denyuntrusted) for detailed documentation.

### Use Methods for Complex Operations

**Don't expose database operations directly:**

```typescript
// ✓ Good: Use methods for business logic
Meteor.methods({
  async 'tasks.complete'(taskId: string) {
    check(taskId, String);

    const task = await TaskModel.findOneAsync(taskId);

    if (!task) {
      throw new Meteor.Error('not-found', 'Task not found');
    }

    if (task.userId !== this.userId) {
      throw new Meteor.Error('unauthorized', 'Not your task');
    }

    await TaskModel.updateAsync(taskId, {
      $set: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // Additional business logic (send notifications, etc.)
  },
});

// ✗ Avoid: Complex logic in allow/deny
TaskModel.allow({
  update: (userId, doc, fieldNames, modifier) => {
    // Don't put business logic here!
    if (modifier.$set?.status === 'completed') {
      // Send notification? Check other conditions? NO!
    }
    return userId === doc.userId;
  },
});
```

### Validate Input in Methods

```typescript
// ✓ Good: Validate all inputs
Meteor.methods({
  async 'tasks.create'(data: unknown) {
    // Validate structure
    const validated = TaskSchema.parse(data);

    // Additional checks
    if (validated.dueDate && validated.dueDate < new Date()) {
      throw new Meteor.Error('invalid-date', 'Due date cannot be in the past');
    }

    // Assign owner
    return await TaskModel.insertAsync({
      ...validated,
      userId: this.userId!,
    });
  },
});
```

### Use Rate Limiting

```typescript
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

// ✓ Good: Rate limit methods
DDPRateLimiter.addRule({
  type: 'method',
  name: 'tasks.create',
  userId(userId) {
    return true; // Apply to all users
  },
}, 5, 1000); // 5 calls per second
```

---

## Index Strategy

### Index Common Query Patterns

```typescript
// User's active tasks sorted by due date
TaskModel.addIndex({ userId: 1, status: 1, dueDate: 1 });

// Recent tasks (for feeds)
TaskModel.addIndex({ createdAt: -1 });

// Search by title (text search)
TaskModel.addIndex({ title: 'text', description: 'text' });
```

### Compound Index Order Matters

```typescript
// ✓ Good: Most specific field first
TaskModel.addIndex({
  userId: 1, // High cardinality (many unique values)
  status: 1, // Low cardinality (few unique values)
  createdAt: -1,
});

// This index can serve:
// - { userId: X }
// - { userId: X, status: Y }
// - { userId: X, status: Y, createdAt: Z }

// But NOT:
// - { status: Y }
// - { createdAt: Z }
```

### Use Sparse Indexes for Optional Fields

```typescript
// ✓ Good: Sparse index for optional field
UserModel.addIndex(
  { phoneNumber: 1 },
  { sparse: true, unique: true }
);
// Only indexes documents with phoneNumber
// Allows multiple null values
```

### TTL Indexes for Temporary Data

```typescript
// ✓ Good: Auto-delete old sessions
SessionModel.addIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60 } // 24 hours
);

// Auto-delete old logs
LogModel.addIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
);
```

---

## Code Organization

### File Structure

```
models/
├── Task.ts         # Task model and schema
├── User.ts         # User model and schema
├── Post.ts         # Post model and schema
└── index.ts        # Re-export all models

schemas/
├── common.ts       # Shared schema fragments
└── validators.ts   # Custom validators

types/
└── models.ts       # Exported types from models
```

### Model File Template

```typescript
// models/Task.ts
import { Model, CustomTypes, SchemaHelpers } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString, foreignKey } = CustomTypes;
const { withCommon } = SchemaHelpers;

// Schema definition
const TaskSchema = withCommon(
  z.object({
    title: nonEmptyString.max(200),
    description: nonEmptyString.optional(),
    status: z.enum(['pending', 'active', 'completed']).default('pending'),
    priority: z.number().int().min(1).max(5).default(3),
    dueDate: z.date().optional(),
    userId: foreignKey,
  })
);

// Model creation
export const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

// Type export
export type Task = ModelType<typeof TaskModel>;

// Indexes
TaskModel.addIndex({ userId: 1, status: 1 });
TaskModel.addIndex({ dueDate: 1 }, { sparse: true });

// Allow/deny rules
if (Meteor.isServer) {
  // Server-specific setup
  TaskModel.allow({
    insert: (userId, doc) => userId !== null && doc.userId === userId,
    update: (userId, doc) => userId !== null && doc.userId === userId,
    remove: (userId, doc) => userId !== null && doc.userId === userId,
  });

  TaskModel.deny({
    update: (userId, doc, fieldNames) => fieldNames.includes('userId'),
  });
}
```

### Centralized Exports

```typescript
// models/index.ts
export { TaskModel } from './Task';
export type { Task } from './Task';

export { UserModel } from './User';
export type { User } from './User';

export { PostModel } from './Post';
export type { Post } from './Post';

// Usage elsewhere
import { TaskModel } from '../models';
import type { Task } from '../models';
```

---

## Error Handling

### Catch and Handle Validation Errors

```typescript
// ✓ Good: Handle specific errors
try {
  await TaskModel.insertAsync(data);
} catch (error) {
  if (error instanceof z.ZodError) {
    // Validation error - show user-friendly message
    const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Meteor.Error('validation-error', messages.join(', '));
  }
  throw error; // Re-throw other errors
}
```

### Provide User-Friendly Error Messages

```typescript
// ✓ Good: Clear error messages
const TaskSchema = z.object({
  title: nonEmptyString.max(200, 'Title must be 200 characters or less'),
  dueDate: z.date({
    invalid_type_error: 'Due date must be a valid date',
    required_error: 'Due date is required',
  }),
});
```

### Validate Before Operations

```typescript
// ✓ Good: Validate early
async function updateTask(taskId: string, updates: Partial<Task>) {
  // Validate updates match schema subset
  const validated = TaskSchema.partial().parse(updates);

  // Then update
  await TaskModel.updateAsync(taskId, {
    $set: validated,
  });
}
```

---

## Testing Strategies

### Test Model Creation

```typescript
describe('TaskModel', () => {
  it('creates model successfully', () => {
    expect(TaskModel).toBeDefined();
    expect(TaskModel.collection._name).toBe('tasks');
  });
});
```

### Test Schema Validation

```typescript
describe('Task schema', () => {
  it('accepts valid data', async () => {
    const valid = {
      title: 'Test Task',
      status: 'pending',
      userId: 'user123',
    };

    await expect(TaskModel.insertAsync(valid)).resolves.toBeTruthy();
  });

  it('rejects invalid data', async () => {
    const invalid = {
      title: '', // Empty title
      status: 'invalid-status',
      userId: 'user123',
    };

    await expect(TaskModel.insertAsync(invalid)).rejects.toThrow(z.ZodError);
  });
});
```

### Test CRUD Operations

```typescript
describe('Task CRUD', () => {
  let taskId: string;

  beforeEach(async () => {
    // Clean up
    await TaskModel.collection.removeAsync({});
  });

  it('inserts task', async () => {
    taskId = await TaskModel.insertAsync({
      title: 'Test',
      userId: 'user123',
    });

    expect(taskId).toBeTruthy();
  });

  it('finds task', async () => {
    const task = await TaskModel.findOneAsync(taskId);
    expect(task?.title).toBe('Test');
  });

  it('updates task', async () => {
    await TaskModel.updateAsync(taskId, {
      $set: { status: 'completed' },
    });

    const updated = await TaskModel.findOneAsync(taskId);
    expect(updated?.status).toBe('completed');
  });

  it('removes task', async () => {
    await TaskModel.removeAsync(taskId);
    const removed = await TaskModel.findOneAsync(taskId);
    expect(removed).toBeUndefined();
  });
});
```

### Use Test Fixtures

```typescript
// test/fixtures.ts
export const testTask = {
  title: 'Test Task',
  description: 'Test description',
  status: 'pending' as const,
  priority: 3,
  userId: 'test-user-id',
};

// test/Task.test.ts
it('inserts test task', async () => {
  const id = await TaskModel.insertAsync(testTask);
  expect(id).toBeTruthy();
});
```

---

## Client-Side Patterns

### Optimistic UI

```typescript
// ✓ Good: Optimistic updates
async function completeTask(taskId: string) {
  // Optimistic UI update
  setTaskCompleted(taskId, true);

  try {
    await Meteor.callAsync('tasks.complete', taskId);
  } catch (error) {
    // Revert on error
    setTaskCompleted(taskId, false);
    showError(error);
  }
}
```

### Reactive Queries

```typescript
// ✓ Good: Reactive data in React
import { useTracker } from 'meteor/react-meteor-data';

function TaskList() {
  const tasks = useTracker(() => {
    return TaskModel.find(
      { userId: Meteor.userId()! },
      { sort: { createdAt: -1 } }
    ).fetch();
  }, []);

  return (
    <div>
      {tasks.map((task) => (
        <TaskItem key={task._id} task={task} />
      ))}
    </div>
  );
}
```

---

## Server-Side Patterns

### Publications

```typescript
// ✓ Good: Secure publications
Meteor.publish('tasks.mine', function() {
  if (!this.userId) {
    return this.ready();
  }

  return TaskModel.find(
    { userId: this.userId },
    { fields: { title: 1, status: 1, dueDate: 1 } }
  );
});
```

### Methods

```typescript
// ✓ Good: Comprehensive methods
Meteor.methods({
  async 'tasks.create'(data: unknown) {
    if (!this.userId) {
      throw new Meteor.Error('unauthorized', 'Must be logged in');
    }

    const validated = TaskSchema.parse(data);

    return await TaskModel.insertAsync({
      ...validated,
      userId: this.userId,
    });
  },

  async 'tasks.update'(taskId: string, updates: unknown) {
    check(taskId, String);

    const task = await TaskModel.findOneAsync(taskId);

    if (!task) {
      throw new Meteor.Error('not-found', 'Task not found');
    }

    if (task.userId !== this.userId) {
      throw new Meteor.Error('unauthorized', 'Not your task');
    }

    const validated = TaskSchema.partial().parse(updates);

    await TaskModel.updateAsync(taskId, { $set: validated });
  },
});
```

---

## Anti-Patterns to Avoid

### ❌ Don't Use `any` Types

```typescript
// ✗ Bad
const task: any = await TaskModel.findOneAsync(taskId);
console.log(task.titl); // Typo not caught!

// ✓ Good
const task = await TaskModel.findOneAsync(taskId);
console.log(task?.title); // TypeScript checks this
```

### ❌ Don't Skip Validation

```typescript
// ✗ Bad: Bypass validation unnecessarily
await TaskModel.insertAsync(data, { bypassSchema: true });

// ✓ Good: Fix the data or schema instead
const validated = TaskSchema.parse(data);
await TaskModel.insertAsync(validated);
```

### ❌ Don't Put Business Logic in Schemas

```typescript
// ✗ Bad: Side effects in transforms
const schema = z.object({
  title: z.string().transform((title) => {
    Meteor.call('log.title', title); // Side effect!
    return title;
  }),
});

// ✓ Good: Keep schemas pure
const schema = z.object({
  title: nonEmptyString,
});

// Handle logic separately
await TaskModel.insertAsync(data);
Meteor.call('log.title', data.title);
```

### ❌ Don't Create Indexes in Methods

```typescript
// ✗ Bad: Dynamic index creation
Meteor.methods({
  'createIndex'() {
    TaskModel.addIndex({ someField: 1 });
  },
});

// ✓ Good: Define indexes at model creation
TaskModel.addIndex({ someField: 1 });
```

---

## Real-World Examples

### Blog Post Model

```typescript
const PostSchema = withCommon(
  z.object({
    title: nonEmptyString.max(200),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    content: nonEmptyString,
    excerpt: nonEmptyString.max(300).optional(),
    coverImage: z.string().url().optional(),
    published: z.boolean().default(false),
    publishedAt: z.date().optional(),
    tags: z.array(nonEmptyString).default([]),
    viewCount: z.number().int().min(0).default(0),
    authorId: foreignKey,
  })
);

export const PostModel = new Model({
  name: 'posts',
  schema: PostSchema,
});

// Indexes
PostModel.addIndex({ slug: 1 }, { unique: true });
PostModel.addIndex({ authorId: 1, published: 1 });
PostModel.addIndex({ publishedAt: -1 });
PostModel.addIndex({ tags: 1 });
```

### E-Commerce Product Model

```typescript
const ProductSchema = withTimestamps(
  z.object({
    name: nonEmptyString.max(200),
    sku: nonEmptyString.regex(/^[A-Z0-9-]+$/),
    description: nonEmptyString,
    price: z.number().positive(),
    compareAtPrice: z.number().positive().optional(),
    cost: z.number().positive().optional(),
    inventory: z.object({
      quantity: z.number().int().min(0),
      trackInventory: z.boolean().default(true),
      lowStockThreshold: z.number().int().min(0).default(10),
    }),
    images: z.array(z.string().url()).default([]),
    category: nonEmptyString,
    tags: z.array(nonEmptyString).default([]),
    variants: z.array(
      z.object({
        name: nonEmptyString,
        sku: nonEmptyString,
        price: z.number().positive(),
        inventory: z.number().int().min(0),
      })
    ).optional(),
    published: z.boolean().default(false),
  })
);

export const ProductModel = new Model({
  name: 'products',
  schema: ProductSchema,
});

// Indexes
ProductModel.addIndex({ sku: 1 }, { unique: true });
ProductModel.addIndex({ category: 1, published: 1 });
ProductModel.addIndex({ name: 'text', description: 'text' });
ProductModel.addIndex({ tags: 1 });
```

---

## See Also

- [API Reference](API.md) - Complete API documentation
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [Migration Guide](MIGRATION.md) - Migrating from other packages
- [Advanced Features](ADVANCED.md) - Deep dives into features
