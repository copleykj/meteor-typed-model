# Schema Helpers

Utilities for composing schemas with common field patterns.

## Table of Contents

- [Overview](#overview)
- [withCommon](#withcommon)
- [withTimestamps](#withtimestamps)
- [withUsers](#withusers)
- [Choosing the Right Helper](#choosing-the-right-helper)
- [Advanced Usage](#advanced-usage)

---

## Overview

Schema helpers provide a convenient way to add common fields to your schemas without repetitive boilerplate. They work with both `ZodObject` schemas and other Zod types.

**Available Helpers:**

| Helper | Fields Added | Use Case |
|--------|-------------|----------|
| `withCommon` | `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | Full audit trail (timestamps + users) |
| `withTimestamps` | `createdAt`, `updatedAt` | Timestamp tracking only |
| `withUsers` | `createdBy`, `updatedBy` | User tracking only |

**Quick Example:**

```typescript
import { SchemaHelpers, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { withCommon } = SchemaHelpers;
const { nonEmptyString } = CustomTypes;

// Without helper (verbose)
const TaskSchemaVerbose = z.object({
  title: nonEmptyString,
  completed: z.boolean(),
  createdAt: createdTimestamp,
  updatedAt: updatedTimestamp,
  createdBy: createdUser,
  updatedBy: updatedUser,
});

// With helper (concise)
const TaskSchema = withCommon(
  z.object({
    title: nonEmptyString,
    completed: z.boolean(),
  })
);
// Result is identical to TaskSchemaVerbose
```

---

## withCommon

```typescript
function withCommon<T extends MongoRecordZodType>(schema: T): T & {
  createdAt: z.ZodDate;
  updatedAt: z.ZodDate;
  createdBy: z.ZodString;
  updatedBy: z.ZodString;
}
```

Adds all common metadata fields: timestamps (`createdAt`, `updatedAt`) and user tracking (`createdBy`, `updatedBy`).

**Fields Added:**

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | `Date` | Auto-set on insert |
| `updatedAt` | `Date` | Auto-set on insert and update |
| `createdBy` | `string` | Auto-set to `Meteor.userId()` on insert |
| `updatedBy` | `string` | Auto-set to `Meteor.userId()` on insert and update |

**Parameters:**
- `schema` - Any valid Zod schema type

**Returns:**
- For `ZodObject`: Extended object with new fields
- For other types: Intersection type with new fields

**Example:**

```typescript
import { Model, SchemaHelpers, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { withCommon } = SchemaHelpers;
const { nonEmptyString } = CustomTypes;

// Define your base schema
const LinkSchema = withCommon(
  z.object({
    title: nonEmptyString,
    url: z.string().url(),
    clicks: z.number().default(0),
  })
);

const LinkModel = new Model({
  name: 'links',
  schema: LinkSchema,
});

// Usage - don't provide the auto-populated fields
const linkId = await LinkModel.insertAsync({
  title: 'Google',
  url: 'https://google.com',
  clicks: 0,
  // createdAt, updatedAt, createdBy, updatedBy all auto-populated
});

const link = await LinkModel.findOneAsync(linkId);
console.log(link.createdAt); // Date
console.log(link.updatedAt); // Date
console.log(link.createdBy); // Current user's ID
console.log(link.updatedBy); // Current user's ID

// On update, timestamps and updatedBy are refreshed
await LinkModel.updateAsync(linkId, {
  $inc: { clicks: 1 },
});

const updated = await LinkModel.findOneAsync(linkId);
console.log(updated.createdAt); // Original date (unchanged)
console.log(updated.updatedAt); // New date (updated)
console.log(updated.createdBy); // Original user (unchanged)
console.log(updated.updatedBy); // Current user (updated)
```

**Use Cases:**
- User-generated content (posts, comments, documents)
- Any data where you need full audit trail
- Multi-user applications
- Most CRUD collections

**Throws:**
- `Error` if schema already contains any of the fields (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`)

---

## withTimestamps

```typescript
function withTimestamps<T extends MongoRecordZodType>(schema: T): T & {
  createdAt: z.ZodDate;
  updatedAt: z.ZodDate;
}
```

Adds timestamp fields only: `createdAt` and `updatedAt`.

**Fields Added:**

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | `Date` | Auto-set on insert |
| `updatedAt` | `Date` | Auto-set on insert and update |

**Parameters:**
- `schema` - Any valid Zod schema type

**Returns:**
- For `ZodObject`: Extended object with new fields
- For other types: Intersection type with new fields

**Example:**

```typescript
import { Model, SchemaHelpers, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { withTimestamps } = SchemaHelpers;
const { nonEmptyString } = CustomTypes;

// System-generated data that doesn't need user tracking
const LogSchema = withTimestamps(
  z.object({
    level: z.enum(['info', 'warn', 'error']),
    message: nonEmptyString,
    source: z.string(),
  })
);

const LogModel = new Model({
  name: 'logs',
  schema: LogSchema,
});

// Usage
await LogModel.insertAsync({
  level: 'error',
  message: 'Database connection failed',
  source: 'app/db.ts',
  // createdAt and updatedAt auto-populated
});

// Query recent logs
const recentLogs = LogModel.find(
  {},
  {
    sort: { createdAt: -1 },
    limit: 100,
  }
).fetch();
```

**Use Cases:**
- System logs or events
- Automated data (no specific user responsible)
- Background job results
- API responses or webhook data
- Any time you need timestamps but not user tracking

**Throws:**
- `Error` if schema already contains `createdAt` or `updatedAt`

---

## withUsers

```typescript
function withUsers<T extends MongoRecordZodType>(schema: T): T & {
  createdBy: z.ZodString;
  updatedBy: z.ZodString;
}
```

Adds user tracking fields only: `createdBy` and `updatedBy`.

**Fields Added:**

| Field | Type | Description |
|-------|------|-------------|
| `createdBy` | `string` | Auto-set to `Meteor.userId()` on insert |
| `updatedBy` | `string` | Auto-set to `Meteor.userId()` on insert and update |

**Parameters:**
- `schema` - Any valid Zod schema type

**Returns:**
- For `ZodObject`: Extended object with new fields
- For other types: Intersection type with new fields

**Example:**

```typescript
import { Model, SchemaHelpers, CustomTypes } from 'meteor/typed:model';
import { z } from 'zod';

const { withUsers } = SchemaHelpers;
const { nonEmptyString, createdTimestamp } = CustomTypes;

// Use withUsers when you have custom timestamp needs
const DocumentSchema = withUsers(
  z.object({
    title: nonEmptyString,
    content: nonEmptyString,
    publishedAt: z.date().optional(), // Custom timestamp
    archivedAt: z.date().optional(), // Custom timestamp
    created: createdTimestamp, // Note: different field name than withTimestamps
  })
);

const DocumentModel = new Model({
  name: 'documents',
  schema: DocumentSchema,
});

// Usage
const docId = await DocumentModel.insertAsync({
  title: 'My Document',
  content: 'Document content...',
  // createdBy and updatedBy auto-populated
});

// Later: publish the document
await DocumentModel.updateAsync(docId, {
  $set: { publishedAt: new Date() },
  // updatedBy auto-updated
});
```

**Use Cases:**
- Custom timestamp needs (not standard `createdAt`/`updatedAt`)
- You're manually tracking timestamps but need user info
- Schemas with complex time tracking (published, archived, etc.)
- Migration from systems with different timestamp conventions

**Throws:**
- `Error` if schema already contains `createdBy` or `updatedBy`

---

## Choosing the Right Helper

### Decision Tree

```
Do you need user tracking?
├─ Yes: Do you need timestamps?
│   ├─ Yes: Use withCommon
│   └─ No: Use withUsers
└─ No: Do you need timestamps?
    ├─ Yes: Use withTimestamps
    └─ No: Don't use a helper (or use CustomTypes directly)
```

### Comparison

| Scenario | Recommended Helper | Reason |
|----------|-------------------|--------|
| User-generated content (posts, comments) | `withCommon` | Need full audit trail |
| System logs or events | `withTimestamps` | No specific user responsible |
| Configuration settings | `withUsers` | User changes matter, custom timestamps |
| Static reference data | None | Rarely modified |
| Real-time sensor data | `withTimestamps` | High volume, system-generated |
| Collaborative documents | `withCommon` | Track who and when |
| Scheduled job results | `withTimestamps` | Automated, no user context |

### Examples by Use Case

**Blog Posts (Full Audit Trail):**

```typescript
const PostSchema = withCommon(
  z.object({
    title: nonEmptyString,
    content: nonEmptyString,
    published: z.boolean().default(false),
  })
);
// Has: createdAt, updatedAt, createdBy, updatedBy
```

**Error Logs (Timestamps Only):**

```typescript
const ErrorLogSchema = withTimestamps(
  z.object({
    error: z.string(),
    stack: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high']),
  })
);
// Has: createdAt, updatedAt
```

**User Preferences (User Tracking Only):**

```typescript
const PreferenceSchema = withUsers(
  z.object({
    userId: foreignKey,
    theme: z.enum(['light', 'dark']),
    language: z.string(),
    lastSyncedAt: z.date(), // Custom timestamp
  })
);
// Has: createdBy, updatedBy
```

---

## Advanced Usage

### Combining with Other Schemas

Schema helpers work well with Zod's composition features:

**Union Types:**

```typescript
const ContentSchema = withCommon(
  z.union([
    z.object({ type: z.literal('text'), text: nonEmptyString }),
    z.object({ type: z.literal('image'), url: z.string().url() }),
  ])
);
// All union variants get the common fields
```

**Discriminated Unions:**

```typescript
const EventSchema = withTimestamps(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('login'), userId: foreignKey }),
    z.object({ type: z.literal('logout'), userId: foreignKey }),
    z.object({ type: z.literal('error'), message: nonEmptyString }),
  ])
);
```

**Arrays:**

```typescript
// Add timestamps to array item schema
const TodoListSchema = z.object({
  name: nonEmptyString,
  items: z.array(
    withTimestamps(
      z.object({
        text: nonEmptyString,
        completed: z.boolean(),
      })
    )
  ),
});
```

### Custom Field Names

If you need different field names, compose manually:

```typescript
import { createdTimestamp, updatedTimestamp } from 'meteor/typed:model';

const CustomSchema = z.object({
  title: nonEmptyString,
  created: createdTimestamp, // Not "createdAt"
  modified: updatedTimestamp, // Not "updatedAt"
});
```

### Extending Helper Results

You can extend schemas after applying helpers:

```typescript
const BaseSchema = withCommon(
  z.object({
    title: nonEmptyString,
    content: nonEmptyString,
  })
);

// Extend for specific use case
const PublishedSchema = BaseSchema.extend({
  publishedAt: z.date(),
  slug: z.string(),
});
```

### Type Extraction

Extract TypeScript types from helper-enhanced schemas:

```typescript
import type { ModelType } from 'meteor/typed:model';

const TaskSchema = withCommon(
  z.object({
    title: nonEmptyString,
    completed: z.boolean(),
  })
);

const TaskModel = new Model({
  name: 'tasks',
  schema: TaskSchema,
});

export type TaskType = ModelType<typeof TaskModel>;
// Type includes: title, completed, createdAt, updatedAt, createdBy, updatedBy, _id
```

### Working with Non-Object Schemas

Helpers work with any Zod schema, not just objects:

```typescript
// Union type
const StatusSchema = withTimestamps(
  z.enum(['pending', 'active', 'completed', 'archived'])
);

// Literal type
const ConfigSchema = withUsers(
  z.object({
    settings: z.record(z.string(), z.unknown()),
  })
);

// Intersection type
const ExtendedSchema = withCommon(
  z.object({ name: nonEmptyString }).and(
    z.object({ tags: z.array(z.string()) })
  )
);
```

**Note:** For non-object schemas, the helper uses `schema.and()` to create an intersection type instead of `schema.extend()`.

---

## Error Handling

All helpers throw an error if you try to add fields that already exist:

```typescript
import { createdTimestamp } from 'meteor/typed:model';

// This will throw an error
const BadSchema = withTimestamps(
  z.object({
    title: nonEmptyString,
    createdAt: createdTimestamp, // ✗ Already exists!
  })
);
// Error: "schema already contains fields from withTimestamps"
```

**Solution:** Remove the duplicate field from your base schema:

```typescript
const GoodSchema = withTimestamps(
  z.object({
    title: nonEmptyString,
    // Let withTimestamps add createdAt
  })
);
```

---

## Best Practices

### 1. Apply Helpers Early

Apply schema helpers as early as possible in your schema definition:

```typescript
// Good: Apply withCommon first
const PostSchema = withCommon(
  z.object({
    title: nonEmptyString,
    content: nonEmptyString,
  })
);

// Also good: Apply helper, then extend
const PostSchemaExtended = withCommon(
  z.object({
    title: nonEmptyString,
  })
).extend({
  content: nonEmptyString,
  tags: z.array(z.string()),
});
```

### 2. Be Consistent

Use the same helper across similar collections:

```typescript
// Good: Consistent use of withCommon for user content
const PostSchema = withCommon(z.object({ ... }));
const CommentSchema = withCommon(z.object({ ... }));
const ReviewSchema = withCommon(z.object({ ... }));

// Avoid: Mixing helpers for similar data
const PostSchema = withCommon(z.object({ ... }));
const CommentSchema = withTimestamps(z.object({ ... })); // Inconsistent!
```

### 3. Document Custom Choices

If you deviate from the standard field names, document why:

```typescript
// We use "created" instead of "createdAt" to match our legacy database
const LegacySchema = z.object({
  title: nonEmptyString,
  created: createdTimestamp, // Custom name for legacy compatibility
  modified: updatedTimestamp,
});
```

### 4. Leverage for Security

Use the auto-populated fields in your allow/deny rules:

```typescript
const PostModel = new Model({
  name: 'posts',
  schema: withCommon(PostSchema),
});

PostModel.allow({
  update: (userId, doc) => {
    // Only the creator can update
    return userId !== null && doc.createdBy === userId;
  },
  remove: (userId, doc) => {
    // Only the creator can remove
    return userId !== null && doc.createdBy === userId;
  },
});
```

---

## See Also

- [Custom Types](CUSTOM_TYPES.md) - Individual types used by schema helpers
- [API Reference](API.md) - Model class documentation
- [Best Practices](BEST_PRACTICES.md) - Recommended patterns
