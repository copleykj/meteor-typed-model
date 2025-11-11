# Type System

Understanding TypeScript type inference in `typed:model`.

## Table of Contents

- [Overview](#overview)
- [Type Utilities](#type-utilities)
  - [ModelType](#modeltype)
  - [Selector](#selector)
  - [FieldsOf](#fieldsof)
  - [ModelResultType](#modelresulttype)
- [Type Inference](#type-inference)
  - [Query Type Inference](#query-type-inference)
  - [Field Projection Type Narrowing](#field-projection-type-narrowing)
  - [Update Type Safety](#update-type-safety)
- [Input vs Output Types](#input-vs-output-types)
- [Advanced Type Scenarios](#advanced-type-scenarios)

---

## Overview

The `typed:model` package provides sophisticated TypeScript type inference that goes beyond basic type safety. The type system ensures:

- **Query results are properly typed** based on your schema
- **Field projections narrow return types** to only include requested fields
- **Insert operations accept flexible input** (with defaults and transforms)
- **Update operations validate against your schema** while supporting MongoDB operators
- **No type assertions needed** in most cases

**Example:**

```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;

const UserSchema = z.object({
  name: nonEmptyString,
  email: z.string().email(),
  age: z.number().int().positive(),
  role: z.enum(['user', 'admin']).default('user'),
});

const UserModel = new Model({
  name: 'users',
  schema: UserSchema,
});

// Extract TypeScript type
export type User = ModelType<typeof UserModel>;
// Type: { _id: string, name: string, email: string, age: number, role: 'user' | 'admin' }

// Insert: accepts input type (role is optional due to default)
await UserModel.insertAsync({
  name: 'John',
  email: 'john@example.com',
  age: 30,
  // role: 'user', // Optional - has default
});

// Query: returns full type
const user = await UserModel.findOneAsync(userId);
// Type: User | undefined
console.log(user?.role); // TypeScript knows about all fields

// Field projection: type narrows to requested fields
const nameOnly = await UserModel.findOneAsync(userId, {
  fields: { name: 1 },
});
// Type: { _id: string, name: string } | undefined
console.log(nameOnly?.name); // ✓ OK
console.log(nameOnly?.email); // ✗ TypeScript error - email not in projection
```

---

## Type Utilities

### `ModelType<M>`

```typescript
type ModelType<M extends Model<any, any>> = ...
```

Extracts the output type (document structure) from a Model instance.

**Purpose:**
- Share types between files without duplicating schemas
- Type function parameters and return values
- Create derived types

**Example:**

```typescript
import { Model, CustomTypes } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';

const PostSchema = z.object({
  title: nonEmptyString,
  content: nonEmptyString,
  published: z.boolean().default(false),
});

export const PostModel = new Model({
  name: 'posts',
  schema: PostSchema,
});

// Extract type for use throughout your application
export type Post = ModelType<typeof PostModel>;

// Use in functions
function formatPost(post: Post): string {
  return `${post.title}: ${post.content}`;
}

// Use in React components
function PostCard({ post }: { post: Post }) {
  return <div>{post.title}</div>;
}

// Create derived types
type PostWithAuthor = Post & {
  author: User;
};
```

**Output Type:**

The extracted type includes:
- The `_id` field (from `idSchema`, defaults to `string`)
- All schema fields with their output types
- Defaults resolved
- Transforms applied

**Why "Output" Type:**

Zod schemas have two types:
- **Input type** (`z.input<Schema>`): What you can pass in (allows defaults to be optional)
- **Output type** (`z.output<Schema>`): What you get out (defaults are resolved)

`ModelType` extracts the output type because that's what you get from queries.

---

### `Selector<T>`

```typescript
type Selector<T> =
  | Mongo.Selector<T>
  | string
  | Mongo.ObjectID
```

Union type representing valid MongoDB selectors for type `T`.

**Variants:**

1. **Object selector**: MongoDB query object
2. **String ID**: Document ID as a string
3. **ObjectID**: Mongo.ObjectID instance

**Example:**

```typescript
async function findUser(selector: Selector<User>): Promise<User | undefined> {
  return await UserModel.findOneAsync(selector);
}

// All valid usages:
await findUser(userId); // string ID
await findUser({ email: 'john@example.com' }); // query object
await findUser(new Mongo.ObjectID(userId)); // ObjectID
await findUser({ age: { $gte: 18 } }); // complex query
```

**Why This Type:**

Meteor's collection methods accept selectors in multiple formats. `Selector<T>` captures all valid formats while maintaining type safety.

---

### `FieldsOf<T>`

```typescript
type FieldsOf<T> = {
  [K in keyof T]?: 1 | 0;
}
```

Type for MongoDB field projection objects.

**Purpose:**
- Type the `fields` option in query methods
- Ensure only valid field names are used
- Enable type narrowing based on projection

**Example:**

```typescript
// Define projection type
const projection: FieldsOf<User> = {
  name: 1,
  email: 1,
  _id: 0, // Exclude _id
};

const users = await UserModel.find({}, { fields: projection }).fetch();
// Type: Array<{ name: string, email: string }>

// TypeScript catches invalid field names
const badProjection: FieldsOf<User> = {
  invalidField: 1, // ✗ TypeScript error
};
```

**Values:**
- `1`: Include field
- `0`: Exclude field

**Note:** MongoDB doesn't allow mixing inclusion (1) and exclusion (0) except for `_id`. The type system doesn't enforce this at compile time, but MongoDB will throw a runtime error.

---

### `ModelResultType<T, S, F>`

```typescript
type ModelResultType<T, S extends Selector<T>, F extends FieldsOf<T>> = ...
```

Advanced type that infers the result type based on selector and field projection.

**Purpose:**
Used internally by Model methods to provide accurate return types based on:
- Document type (`T`)
- Selector used (`S`)
- Fields projected (`F`)

**You typically don't use this directly** - the Model class uses it for return type inference.

**How It Works:**

```typescript
// Internally, findOneAsync uses ModelResultType:
findOneAsync<S extends Selector<T>, F extends FieldsOf<T>>(
  selector?: S,
  options?: { fields?: F }
): Promise<ModelResultType<T, S, F>>

// This enables type narrowing:
const full = await UserModel.findOneAsync(userId);
// Type: User | undefined

const partial = await UserModel.findOneAsync(userId, { fields: { name: 1 } });
// Type: { _id: string, name: string } | undefined
```

---

## Type Inference

### Query Type Inference

Model query methods automatically infer return types based on your schema.

**findOneAsync:**

```typescript
// Full document
const user = await UserModel.findOneAsync(userId);
// Type: User | undefined

// With query
const admin = await UserModel.findOneAsync({ role: 'admin' });
// Type: User | undefined
```

**find:**

```typescript
// Cursor type is inferred
const cursor = UserModel.find({ age: { $gte: 18 } });
// Type: Mongo.Cursor<User>

// Fetch returns array
const users = cursor.fetch();
// Type: User[]

// forEach knows the type
UserModel.find({}).forEach((user) => {
  console.log(user.name); // TypeScript knows about name
});
```

**findOne (synchronous):**

```typescript
// Use in reactive contexts
const user = UserModel.findOne(userId);
// Type: User | undefined
```

---

### Field Projection Type Narrowing

When you use field projections, the return type automatically narrows to only include the requested fields.

**Basic Projection:**

```typescript
const nameEmail = await UserModel.findOneAsync(userId, {
  fields: { name: 1, email: 1 },
});
// Type: { _id: string, name: string, email: string } | undefined

console.log(nameEmail?.name); // ✓ OK
console.log(nameEmail?.age); // ✗ TypeScript error - age not in result
```

**Excluding _id:**

```typescript
const noId = await UserModel.findOneAsync(userId, {
  fields: { name: 1, _id: 0 },
});
// Type: { name: string } | undefined
// Note: _id is excluded from type
```

**With Arrays:**

```typescript
const users = await UserModel.find(
  { age: { $gte: 18 } },
  { fields: { name: 1, email: 1 } }
).fetch();
// Type: Array<{ _id: string, name: string, email: string }>

users.forEach((user) => {
  console.log(user.name); // ✓ OK
  console.log(user.age); // ✗ TypeScript error
});
```

**Benefits:**
- **Prevents bugs**: TypeScript catches attempts to access fields not in projection
- **Self-documenting**: Function signatures show exactly what fields are available
- **Refactoring safety**: Changing projections updates types automatically

---

### Update Type Safety

Update operations are type-safe with MongoDB operators.

**Basic Updates:**

```typescript
// TypeScript validates field names and types
await UserModel.updateAsync(userId, {
  $set: {
    name: 'Jane', // ✓ OK - correct type
    age: 25, // ✓ OK - correct type
  },
});

// TypeScript catches errors
await UserModel.updateAsync(userId, {
  $set: {
    name: 123, // ✗ TypeScript error - wrong type
    invalidField: 'value', // ✗ TypeScript error - field doesn't exist
  },
});
```

**Multiple Operators:**

```typescript
await UserModel.updateAsync(userId, {
  $set: { name: 'Jane' },
  $inc: { age: 1 },
  $unset: { tempField: '' },
});
// All operators are type-checked
```

**Array Operations:**

```typescript
const PostSchema = z.object({
  title: nonEmptyString,
  tags: z.array(z.string()),
});

await PostModel.updateAsync(postId, {
  $push: { tags: 'typescript' }, // ✓ OK - string matches array type
  $pull: { tags: 'outdated' }, // ✓ OK
});

await PostModel.updateAsync(postId, {
  $push: { tags: 123 }, // ✗ TypeScript error - wrong type
});
```

---

## Input vs Output Types

Zod schemas have two TypeScript types: input and output. Understanding the difference is important.

### Input Types (`z.input<Schema>`)

**What you provide** to insert operations.

- Defaults are optional
- Transforms haven't been applied
- More flexible/permissive

**Example:**

```typescript
const Schema = z.object({
  name: z.string(),
  age: z.number(),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.date().default(() => new Date()),
});

type Input = z.input<typeof Schema>;
// Type: { name: string, age: number, role?: 'user' | 'admin', createdAt?: Date }
// Notice role and createdAt are optional (have defaults)
```

### Output Types (`z.output<Schema>`)

**What you get back** from query operations.

- Defaults are resolved
- Transforms have been applied
- Stricter/exact types

**Example:**

```typescript
type Output = z.output<typeof Schema>;
// Type: { name: string, age: number, role: 'user' | 'admin', createdAt: Date }
// role and createdAt are required (defaults were applied)
```

### In Practice

**Insert uses input type:**

```typescript
await UserModel.insertAsync({
  name: 'John',
  age: 30,
  // role is optional - has default
  // createdAt is optional - has default
});
```

**Queries return output type:**

```typescript
const user = await UserModel.findOneAsync(userId);
// Type: { _id: string, name: string, age: number, role: 'user' | 'admin', createdAt: Date }

console.log(user.role); // ✓ OK - role is always present (has default)
console.log(user.createdAt); // ✓ OK - createdAt is always present
```

**Why This Matters:**

This design makes the API intuitive:
- **Inserting is flexible**: Don't need to specify fields with defaults
- **Querying is strict**: Know exactly what fields exist in result

---

## Advanced Type Scenarios

### Conditional Fields

**Schema with optional fields:**

```typescript
const ProfileSchema = z.object({
  displayName: nonEmptyString,
  bio: z.string().optional(),
  website: z.string().url().optional(),
  avatar: z.string().url().optional(),
});

type Profile = ModelType<typeof ProfileModel>;
// Type: { _id: string, displayName: string, bio?: string, website?: string, avatar?: string }

// Use with optional chaining
const profile = await ProfileModel.findOneAsync(profileId);
console.log(profile?.bio?.substring(0, 100)); // Safe navigation
```

### Union Types

**Discriminated unions:**

```typescript
const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('click'),
    element: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    type: z.literal('pageview'),
    url: z.string().url(),
    referrer: z.string().optional(),
  }),
]);

type Event = ModelType<typeof EventModel>;
// Type: { _id: string, type: 'click', element: string, x: number, y: number }
//     | { _id: string, type: 'pageview', url: string, referrer?: string }

// TypeScript narrows based on discriminator
const event = await EventModel.findOneAsync(eventId);
if (event?.type === 'click') {
  console.log(event.x, event.y); // ✓ OK - TypeScript knows structure
} else if (event?.type === 'pageview') {
  console.log(event.url); // ✓ OK
}
```

### Nested Objects

**Deep nesting:**

```typescript
const UserSchema = z.object({
  name: nonEmptyString,
  profile: z.object({
    avatar: z.string().url(),
    bio: z.string().optional(),
  }),
  settings: z.object({
    notifications: z.object({
      email: z.boolean().default(true),
      push: z.boolean().default(true),
    }),
  }),
});

type User = ModelType<typeof UserModel>;

// Access nested fields
const user = await UserModel.findOneAsync(userId);
console.log(user?.profile.avatar); // ✓ OK - fully typed
console.log(user?.settings.notifications.email); // ✓ OK

// Update nested fields
await UserModel.updateAsync(userId, {
  $set: {
    'profile.bio': 'New bio',
    'settings.notifications.email': false,
  },
});
// Dot-notation is type-checked
```

### Recursive Types

**Self-referencing schemas:**

```typescript
type CategoryInput = {
  name: string;
  parentId?: string;
  subcategories?: CategoryInput[];
};

const CategorySchema: z.ZodType<CategoryInput> = z.lazy(() =>
  z.object({
    name: nonEmptyString,
    parentId: foreignKey.optional(),
    subcategories: z.array(CategorySchema).optional(),
  })
);

type Category = ModelType<typeof CategoryModel>;
// Recursive type is properly inferred
```

### Branded Types

**Creating distinct types for IDs:**

```typescript
type UserId = string & { __brand: 'UserId' };
type PostId = string & { __brand: 'PostId' };

const UserIdSchema = z.string().transform((s) => s as UserId);
const PostIdSchema = z.string().transform((s) => s as PostId);

// Now UserId and PostId are incompatible
function getUser(userId: UserId) { /* ... */ }
function getPost(postId: PostId) { /* ... */ }

const userId: UserId = 'abc123' as UserId;
const postId: PostId = 'xyz789' as PostId;

getUser(userId); // ✓ OK
getUser(postId); // ✗ TypeScript error - wrong brand
```

### Generic Type Functions

**Type-safe helper functions:**

```typescript
async function findById<T extends Model<any, any>>(
  model: T,
  id: string
): Promise<ModelType<T> | undefined> {
  return await model.findOneAsync(id);
}

// Usage with type inference
const user = await findById(UserModel, userId);
// Type: User | undefined

const post = await findById(PostModel, postId);
// Type: Post | undefined
```

### Readonly Types

**Immutable query results:**

```typescript
const user = await UserModel.findOneAsync(userId);

// Create readonly version
const readonlyUser: Readonly<typeof user> = user;

readonlyUser.name = 'Jane'; // ✗ TypeScript error - readonly

// Deep readonly for nested objects
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

const deepReadonlyUser: DeepReadonly<User> = user;
```

---

## Best Practices

### 1. Export Types with Models

```typescript
// models/User.ts
export const UserModel = new Model({ ... });
export type User = ModelType<typeof UserModel>;
```

### 2. Use Type Guards

```typescript
function isAdmin(user: User): user is User & { role: 'admin' } {
  return user.role === 'admin';
}

if (isAdmin(user)) {
  // TypeScript knows user.role === 'admin'
}
```

### 3. Avoid Type Assertions

Let TypeScript infer types naturally:

```typescript
// Bad: Unnecessary assertion
const user = await UserModel.findOneAsync(userId) as User;

// Good: Let TypeScript infer
const user = await UserModel.findOneAsync(userId);
```

### 4. Use Projection Types

```typescript
// Define common projections as types
type UserSummary = Pick<User, '_id' | 'name' | 'email'>;

const projection: FieldsOf<User> = {
  name: 1,
  email: 1,
};

const summary = await UserModel.findOneAsync(userId, { fields: projection });
// Type matches UserSummary
```

---

## See Also

- [API Reference](API.md) - Model class methods
- [Custom Types](CUSTOM_TYPES.md) - Understanding transform types
- [Advanced Features](ADVANCED.md) - Deep dive into type system internals
