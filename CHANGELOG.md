# Typed Model Change Log

## v1.1.0

Maintenance release for the **Zod 3** line. Feature-parity backport of the v2.0.0 improvements,
minus the Zod 4 migration — if you are on Zod 4, use `typed:model@2.x` instead.

### Features

- **NEW**: Opt-in database-level validation via `attachValidator: true`
  - Generates a MongoDB JSON Schema validator from your Zod schema and attaches it to the collection
  - Uses `createCollection` for new collections, `collMod` for existing ones
  - Enforces `validationLevel: 'strict'` and `validationAction: 'error'`
  - Defense-in-depth: writes that bypass Meteor entirely (`rawCollection()`, admin tools, other services) are still validated
  - Server-only; ignored on the client
  - Write methods await attachment internally, so there is no race between construction and the first operation
  - `bypassSchema` bypasses the database layer too, via `bypassDocumentValidation: true`
  - See [Database-Level Validation](README.md#database-level-validation)

### Bug Fixes

- **FIX**: The internal `_meteortypedmodelTrusted` marker is no longer persisted into MongoDB documents.
  The marker is stripped by deny rules, which only run for client-initiated writes, so every server-side
  `insertAsync`, `updateAsync`, and `upsertAsync` was writing it into the stored document. It is now only
  added on the client, where the deny rules that consume it actually run.
- **FIX**: The `zod` peer requirement was pinned to `3.23.x`, which failed the version check against
  zod 3.24. It is now `^3.23.0`.
- **FIX**: `find()`, `findOne()`, and `findOneAsync()` called **without** a field projection now
  return the full document type. Previously the projection type parameter fell back to its
  `FieldsOf` constraint, which resolved every field in the result type to `never` — silently
  removing type safety from unprojected queries. Projected queries are unchanged and still narrow
  the result to the selected fields.
- **FIX** ([#1](https://github.com/copleykj/meteor-typed-model/issues/1)): Wrapping an existing
  collection typed independently of the schema — most notably `Meteor.users` — did not compile.
  The constructor's `collection` parameter was typed `Mongo.Collection<z.output<Schema>>`, and
  since the `Collection` generic is invariant, `Mongo.Collection<Meteor.User>` was never
  assignable to it. The parameter is now `Mongo.Collection<any>` (as `docs/API.md` always
  documented); the Model's own schema typing governs everything from there. The README's
  "Working With Existing Collections" example was also corrected: it used `z.string()` for
  `username`, which violates the non-empty-string policy and made Model construction throw.

### Testing

- **FIX**: The 32 client-side tests were silently not running (reported as `0 passing`). The shared test
  entry point pulled suites in with dynamic `import()`; on the client those are fetched over DDP and did
  not resolve until after the test driver had finished, so no tests were ever registered. Split into
  per-architecture entry points (`tests/server.ts`, `tests/client.ts`) using static imports.
- Add `tests/unit/DatabaseValidation.test.ts` covering opt-in behavior, `createCollection`/`collMod`
  attachment paths, both validation layers, `bypassSchema`, attachment-failure handling, and
  marker-leak regressions for insert, update, and upsert
- Add `tests/unit/ExistingCollection.test.ts` covering wrapping `Meteor.users` (issue #1 regression)
- Add compile-time type assertions locking in the public type contract: `insertAsync` doc parameter
  typing, `updateAsync`/`upsertAsync` return types, full-document result types for unprojected
  `find`/`findOneAsync`, field-projection narrowing, and `withCommon` output types

## v1.0.0 (2025-11-10)

**🎉 First stable release!**

### Security

- **NEW**: Add `denyUntrusted()` helper to protect fields from client modifications
  - Prevents privilege escalation attacks (e.g., clients setting `isAdmin: true`)
  - Uses Meteor's `deny()` system for defense-in-depth security
  - Works even if underlying collection is accessed directly
  - Automatically protects timestamp and user tracking fields in schema helpers
  - See [Custom Types - denyUntrusted](docs/CUSTOM_TYPES.md#denyuntrusted) for details

### Documentation

- Add comprehensive documentation suite:
  - [API Reference](docs/API.md) - Complete Model class API
  - [Custom Types](docs/CUSTOM_TYPES.md) - All built-in types with examples
  - [Schema Helpers](docs/SCHEMA_HELPERS.md) - Composition patterns
  - [Type System](docs/TYPE_SYSTEM.md) - TypeScript type inference
  - [Best Practices](docs/BEST_PRACTICES.md) - Security, performance, patterns
  - [Advanced Usage](docs/ADVANCED.md) - Custom types, edge cases
  - [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues
  - [Migration Guide](docs/MIGRATION.md) - From collection2/simple-schema

### Testing

- Add comprehensive test coverage: **116 tests** (84 server + 32 client)
  - Server-side unit tests for all Model operations
  - Client-side tests for `denyUntrusted` protection (via Playwright)
  - Client-side tests for Model method protection (`Model.insertAsync()`, `Model.updateAsync()`)
  - Schema validation and transformation tests
  - Allow/deny rule integration tests
  - Collection2-style automatic validation deny rules

### Features

- Support for nested protected fields (dot notation)
- Auto-protect timestamp and user fields in `withTimestamps`, `withUsers`, and `withCommon`
- Clear error messages for field protection violations

## v0.0.5 (2024)

- Update README with improved examples and documentation
- Initial test suite migration from JollyRoger project

## v0.0.4

- (Version skipped - no v0.0.4 release)

## v0.0.3

- **Breaking Change**: Change `Model` class constructor to accept configuration object instead of positional parameters
  - Old: `new Model(name, schema, idSchema?)`
  - New: `new Model({ name, schema, idSchema?, collection? })`
- Add `collection` configuration option to allow passing an existing collection (e.g., `Meteor.users`)
- Update CHANGELOG format

## v0.0.2

- Remove PrettifyType since it mangles types when fields key isn't present
- Fixes for documentation and tests

## v0.0.1

- Initial release
- Core Model class with Zod schema validation
- TypeScript type inference for queries and updates
- Custom types (stringId, timestamps, user tracking, etc.)
- Schema helpers (withCommon, withTimestamps, withUsers)
- MongoDB update operator support
- Index management
