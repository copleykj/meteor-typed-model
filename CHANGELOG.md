# Typed Model Change Log

## Unreleased

- Add comprehensive documentation (API reference, Custom Types, Schema Helpers, etc.)
- Add collection2-style client validation with automatic schema validation deny rules
- Add comprehensive test coverage (65 tests: 61 server-side + 4 client-side)

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
