/* global Package */
Package.describe({
  name: 'typed:model',
  version: '0.0.5',
  summary: 'A Zod validated wraper around Meteor\'s Mongo.Collection for your meteor app',
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
  api.use('tinytest');
  api.use('typed:model');
  api.mainModule('model-tests.js');
});
