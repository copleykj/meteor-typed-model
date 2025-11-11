// @ts-expect-error - Meteor package imports are not typed
import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions(
  {
    'zod': '3.23.x',
  },
  'typed:model',
);

