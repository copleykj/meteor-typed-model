# Typed Model Change Log

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
