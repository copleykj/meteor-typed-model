# Typed Model Change Log

## v0.0.3

- Change `Model` class to accept object for configuration. This change accepts the same parameters as before, but as named keys of the object.
- Add additional collection configuration option to allow passing in an existing collection for use internally instead of creating a new one. This is useful for creating typed models from collections such as the existing `Meteor.users` collection.
