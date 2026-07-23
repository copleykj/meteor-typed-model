/* global Package, Npm */
Package.describe({
  name: 'typed:model',
  version: '1.1.0',
  summary: 'A Zod validated wrapper around Meteor\'s Mongo.Collection for your meteor app',
  git: 'https://github.com/copleykj/meteor-typed-model',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('3.0.1');
  api.use('ecmascript');
  api.use('typescript');
  api.use('mongo');
  api.use('zodern:types@1.0.13');
  api.use('tmeasday:check-npm-versions@2.0.0-rc300.0');
  api.mainModule('exports.ts');
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('typescript');
  api.use('mongo');
  api.use('random');
  api.use('autopublish');
  // Provides Meteor.users for the existing-collection wrapping tests
  api.use('accounts-base');
  api.use('meteortesting:mocha@3.2.0');
  api.use('typed:model');

  // Declare npm dependencies for testing
  Npm.depends({
    'playwright': '1.48.0'
  });

  api.mainModule('tests/server.ts', 'server');
  api.mainModule('tests/client.ts', 'client');
});
