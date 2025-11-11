# Troubleshooting

Common issues, solutions, and frequently asked questions for `typed:model`.

## Table of Contents

- [Common Errors](#common-errors)
  - [Empty String Validation](#empty-string-validation)
  - [Full Document Update Rejected](#full-document-update-rejected)
  - [bypassSchema on Client](#bypassschema-on-client)
  - [Type Inference Issues](#type-inference-issues)
  - [Transform Not Working](#transform-not-working)
- [FAQ](#frequently-asked-questions)
  - [General Questions](#general-questions)
  - [Schema Questions](#schema-questions)
  - [Type System Questions](#type-system-questions)
  - [Performance Questions](#performance-questions)
- [Debugging Tips](#debugging-tips)
- [Known Limitations](#known-limitations)
- [Getting Help](#getting-help)

---

## Common Errors

### Empty String Validation

**Error:**
```
ZodError: String must contain at least 1 character(s)
```

**Cause:**

The package enforces a policy that string fields must not accept empty strings by default.

**Solution 1: Use `nonEmptyString`**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { nonEmptyString } = CustomTypes;

const schema = z.object({
  title: nonEmptyString, // Explicitly non-empty
  content: nonEmptyString,
});
```

**Solution 2: Use `allowedEmptyString` if you need empty strings**

```typescript
import { CustomTypes } from 'meteor/typed:model';
const { allowedEmptyString } = CustomTypes;

const schema = z.object({
  notes: allowedEmptyString, // Explicitly allows empty strings
});
```

**Why this policy exists:**

Empty strings are often unintentional and can cause issues:
- UI bugs (blank fields displayed)
- Search/filter problems
- Data quality issues

The package requires you to explicitly opt-in to empty strings.

---

### Full Document Update Rejected

**Error:**
```
Error: Updates must use MongoDB update operators ($set, $push, etc.), not full document replacements
```

**Cause:**

You're trying to pass a full document to `updateAsync` instead of using MongoDB update operators.

**Incorrect:**

```typescript
// ✗ Wrong: This is a full document, not an update modifier
await TaskModel.updateAsync(taskId, {
  title: 'New Title',
  completed: true,
});
```

**Correct:**

```typescript
// ✓ Correct: Use $set operator
await TaskModel.updateAsync(taskId, {
  $set: {
    title: 'New Title',
    completed: true,
  },
});
```

**Why this restriction exists:**

Full document replacements can accidentally:
- Remove auto-populated fields (createdAt, updatedAt, etc.)
- Bypass transform logic
- Cause unexpected data loss

The package requires explicit MongoDB operators for safety.

---

### bypassSchema on Client

**Error:**
```
Error: bypassSchema option is only available on the server
```

**Cause:**

You're trying to use `bypassSchema: true` in client-side code.

**Solution:**

Only use `bypassSchema` in server-side code:

```typescript
// ✓ Correct: Server-only
if (Meteor.isServer) {
  await TaskModel.insertAsync(doc, { bypassSchema: true });
}

// ✗ Wrong: Client-side
// This will throw an error
await TaskModel.insertAsync(doc, { bypassSchema: true });
```

**Why:**

Allowing clients to bypass schema validation would be a major security vulnerability. The package prevents this by throwing an error on the client.

---

### Type Inference Issues

**Problem: TypeScript can't infer types**

```typescript
// Type is 'any'
const task = await TaskModel.findOneAsync(taskId);
```

**Cause 1: Model not properly typed**

Make sure you're not using `any` in your Model definition:

```typescript
// ✗ Wrong
const TaskModel: any = new Model({ ... });

// ✓ Correct
const TaskModel = new Model({ ... });
```

**Cause 2: Missing type annotation on schema**

```typescript
// ✗ Wrong: TypeScript can't infer from dynamic object
const fields = { title: 1, completed: 1 };
const task = await TaskModel.findOneAsync(taskId, { fields });

// ✓ Correct: Use const assertion or type annotation
const fields = { title: 1, completed: 1 } as const;
const task = await TaskModel.findOneAsync(taskId, { fields });
```

**Cause 3: Complex Zod schema**

Some very complex Zod schemas can cause TypeScript to give up on inference. Simplify or add explicit type annotations:

```typescript
import type { ModelType } from 'meteor/typed:model';

type Task = ModelType<typeof TaskModel>;

const task: Task | undefined = await TaskModel.findOneAsync(taskId);
```

---

### Transform Not Working

**Problem: Transform function doesn't run**

```typescript
const schema = z.object({
  createdAt: z.date().default(() => new Date()),
});

await Model.insertAsync({}); // createdAt is undefined!
```

**Cause: Schema not passed through validation**

Transforms only run when the schema validates the data.

**Solution: Ensure validation runs**

```typescript
// This should work - Model.insertAsync validates
await TaskModel.insertAsync({});

// Direct collection access may skip validation on server
if (Meteor.isServer) {
  await TaskModel.collection.insertAsync({}); // May not run transforms
}
```

**For Custom Types:**

Ensure you're using the context variables correctly:

```typescript
import { IsInsert } from 'meteor/typed:model';

const createdAt = z.date().optional().transform((v) => {
  if (v) return v;
  if (IsInsert.getOrNullIfOutsideFiber()) {
    return new Date();
  }
  return undefined as unknown as Date;
});
```

---

## Frequently Asked Questions

### General Questions

#### Q: Is `typed:model` production-ready?

**A:** Yes! The package has been extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project where it's been running in production. It includes comprehensive test coverage (65 tests).

#### Q: Does it work with Meteor 3?

**A:** Yes, the package requires Meteor 3.0.1 or later and is fully compatible with Meteor 3.

#### Q: Can I use it with existing collections?

**A:** Yes! Pass an existing collection to the Model constructor:

```typescript
const UserModel = new Model({
  name: 'users',
  schema: UserSchema,
  collection: Meteor.users,
});
```

#### Q: Does it work on both client and server?

**A:** Yes, the package works isomorphically. However, some features (like `bypassSchema`) are server-only for security reasons.

#### Q: How does it compare to `aldeed:collection2`?

**A:** Both packages provide schema validation for Meteor collections. Key differences:
- `typed:model` uses Zod instead of SimpleSchema
- `typed:model` provides full TypeScript type inference
- `typed:model` has auto-populated fields (timestamps, user tracking)
- Both use the same allow/deny mechanism for client security

See the [Migration Guide](MIGRATION.md) for details.

---

### Schema Questions

#### Q: Can I use regular `z.string()` instead of `nonEmptyString`?

**A:** No, the package enforces that strings must not accept empty values by default. Use `nonEmptyString` or `allowedEmptyString`:

```typescript
// ✗ Will fail validation during Model construction
const schema = z.object({
  title: z.string(), // Not allowed
});

// ✓ Correct
const schema = z.object({
  title: nonEmptyString, // Or allowedEmptyString if needed
});
```

#### Q: How do I make a field optional?

**A:** Use `.optional()`:

```typescript
const schema = z.object({
  title: nonEmptyString,
  description: nonEmptyString.optional(), // Can be undefined
});
```

#### Q: Can I use Zod refinements?

**A:** Yes! All Zod features are supported:

```typescript
const schema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
```

#### Q: How do I handle enums?

**A:** Use `z.enum()` or `z.nativeEnum()`:

```typescript
// String enum
const schema = z.object({
  status: z.enum(['pending', 'active', 'completed']),
});

// TypeScript enum
enum Role {
  User = 'user',
  Admin = 'admin',
}

const schema = z.object({
  role: z.nativeEnum(Role),
});
```

#### Q: Can I have arrays of objects?

**A:** Yes:

```typescript
const schema = z.object({
  title: nonEmptyString,
  tags: z.array(z.string()),
  comments: z.array(
    z.object({
      author: nonEmptyString,
      text: nonEmptyString,
      createdAt: z.date(),
    })
  ),
});
```

#### Q: How do I handle nested objects?

**A:** Just nest them:

```typescript
const schema = z.object({
  user: z.object({
    name: nonEmptyString,
    profile: z.object({
      avatar: z.string().url(),
      bio: nonEmptyString.optional(),
    }),
  }),
});
```

#### Q: Can I reuse schemas?

**A:** Yes:

```typescript
const AddressSchema = z.object({
  street: nonEmptyString,
  city: nonEmptyString,
  country: nonEmptyString,
});

const UserSchema = z.object({
  name: nonEmptyString,
  homeAddress: AddressSchema,
  workAddress: AddressSchema.optional(),
});
```

---

### Type System Questions

#### Q: Why is my field type `string | undefined` instead of `string`?

**A:** The field is optional in your schema:

```typescript
const schema = z.object({
  name: nonEmptyString.optional(), // Type: string | undefined
});
```

Remove `.optional()` if the field should always exist:

```typescript
const schema = z.object({
  name: nonEmptyString, // Type: string
});
```

#### Q: How do I extract types from my Model?

**A:** Use the `ModelType` utility:

```typescript
import type { ModelType } from 'meteor/typed:model';

export type Task = ModelType<typeof TaskModel>;
```

#### Q: Why doesn't TypeScript narrow my field projection?

**A:** Make sure you're using a type annotation or const assertion:

```typescript
// ✗ Type not narrowed
const fields = { title: 1 };
const task = await TaskModel.findOneAsync(taskId, { fields });

// ✓ Type narrowed correctly
const fields = { title: 1 } as const;
const task = await TaskModel.findOneAsync(taskId, { fields });
```

#### Q: Can I use the same schema for multiple Models?

**A:** Yes, but each Model will have independent validation:

```typescript
const schema = z.object({ name: nonEmptyString });

const Model1 = new Model({ name: 'collection1', schema });
const Model2 = new Model({ name: 'collection2', schema });
```

---

### Performance Questions

#### Q: Does schema validation impact performance?

**A:** Zod validation is fast, but it does add overhead. Performance impact is typically negligible for normal operations. For bulk operations, consider:

1. Using `bypassSchema` on server (use sparingly)
2. Batching operations
3. Using MongoDB bulk operations

```typescript
// For bulk inserts on server
if (Meteor.isServer) {
  for (const doc of largeDataset) {
    await TaskModel.insertAsync(doc, { bypassSchema: true });
  }
}
```

#### Q: Do indexes impact performance?

**A:** Indexes improve query performance but:
- Slow down writes (inserts/updates)
- Use disk space
- Need maintenance

Only create indexes for fields you actually query.

#### Q: Should I use field projections?

**A:** Yes! Field projections:
- Reduce data transfer
- Improve query speed
- Provide better type safety

```typescript
// Only fetch needed fields
const task = await TaskModel.findOneAsync(
  taskId,
  { fields: { title: 1, status: 1 } }
);
```

#### Q: Does `typed:model` support reactivity?

**A:** Yes! The `find()` and `findOne()` methods return reactive cursors that work with Meteor's Tracker:

```typescript
// In a reactive context (publication, Tracker.autorun)
const tasks = TaskModel.find({ userId }).fetch(); // Reactive!
```

---

## Debugging Tips

### Enable Zod Error Details

```typescript
try {
  await TaskModel.insertAsync(invalidData);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('Validation errors:', error.errors);
    error.errors.forEach((err) => {
      console.log(`  ${err.path.join('.')}: ${err.message}`);
    });
  }
}
```

### Check Schema Structure

```typescript
console.log('Schema shape:', TaskSchema.shape);
console.log('Schema keys:', Object.keys(TaskSchema.shape));
```

### Verify Model Configuration

```typescript
console.log('Collection name:', TaskModel.collection._name);
console.log('All models:', Array.from(AllModels).map((m) => m.collection._name));
```

### Test Schema Validation

```typescript
// Test data against schema directly
const result = TaskSchema.safeParse({ title: 'Test', completed: false });
if (!result.success) {
  console.log('Validation errors:', result.error.errors);
} else {
  console.log('Valid data:', result.data);
}
```

### Check Indexes

```typescript
// Server-side
if (Meteor.isServer) {
  const indexes = await TaskModel.collection.rawCollection().indexes();
  console.log('Indexes:', indexes);
}
```

### Monitor Operations

```typescript
// Wrap operations for logging
async function insertWithLogging<T>(model: Model<any, any>, doc: any) {
  console.log('Inserting:', doc);
  try {
    const id = await model.insertAsync(doc);
    console.log('Inserted with ID:', id);
    return id;
  } catch (error) {
    console.error('Insert failed:', error);
    throw error;
  }
}
```

---

## Known Limitations

### 1. Transform Complexity

Very complex transforms may not work as expected with MongoDB operators. Keep transforms simple:

```typescript
// ✓ Simple transform - works well
z.string().transform((s) => s.toLowerCase())

// ✗ Complex transform - may cause issues
z.string().transform(async (s) => await fetchFromAPI(s))
```

### 2. Circular References

Zod doesn't support truly circular schemas directly. Use `z.lazy()` for recursive types:

```typescript
type Category = {
  name: string;
  subcategories?: Category[];
};

const CategorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    name: nonEmptyString,
    subcategories: z.array(CategorySchema).optional(),
  })
);
```

### 3. MongoDB Operator Mixing

MongoDB doesn't allow mixing inclusion and exclusion in field projections (except for `_id`):

```typescript
// ✗ Invalid MongoDB operation
const task = await TaskModel.findOneAsync(taskId, {
  fields: { title: 1, content: 0 }, // Can't mix
});

// ✓ Valid
const task = await TaskModel.findOneAsync(taskId, {
  fields: { title: 1, completed: 1, _id: 0 }, // OK to exclude _id
});
```

### 4. JSON Schema Generation

Some advanced Zod features don't translate to MongoDB JSON Schema:
- Complex refinements
- Async transforms
- Custom type guards

The generator provides best-effort conversion.

### 5. Type Inference Depth

Very deeply nested or complex schemas may cause TypeScript to give up on type inference. Add explicit type annotations if needed.

---

## Getting Help

### Documentation

- **[API Reference](API.md)** - Complete API documentation
- **[Custom Types](CUSTOM_TYPES.md)** - Pre-built types
- **[Schema Helpers](SCHEMA_HELPERS.md)** - Schema composition
- **[Type System](TYPE_SYSTEM.md)** - TypeScript inference
- **[Advanced Features](ADVANCED.md)** - Deep dives
- **[Migration Guide](MIGRATION.md)** - From other packages
- **[Best Practices](BEST_PRACTICES.md)** - Recommended patterns

### Community

- **GitHub Issues**: [github.com/copleykj/meteor-typed-model/issues](https://github.com/copleykj/meteor-typed-model/issues)
- **Meteor Forums**: [forums.meteor.com](https://forums.meteor.com)
- **Meteor Slack**: [meteor-community.slack.com](https://meteor-community.slack.com)

### Reporting Bugs

When reporting issues, please include:

1. **Minimal reproduction** - Simplest code that demonstrates the issue
2. **Expected behavior** - What you expected to happen
3. **Actual behavior** - What actually happened
4. **Environment**:
   - Meteor version
   - Node version
   - Package version
   - TypeScript version (if applicable)
5. **Error messages** - Full error output including stack traces

**Good bug report template:**

```markdown
## Description
Brief description of the issue

## Reproduction
```typescript
// Minimal code to reproduce
const schema = z.object({ ... });
const model = new Model({ ... });
await model.insertAsync({ ... }); // Fails here
```

## Expected
Should insert successfully

## Actual
Error: ZodError: ...

## Environment
- Meteor: 3.0.1
- typed:model: 0.0.5
- Node: 20.10.0
```

---

## See Also

- [API Reference](API.md) - Complete API documentation
- [Best Practices](BEST_PRACTICES.md) - Recommended patterns
- [Migration Guide](MIGRATION.md) - Migrating from other packages
