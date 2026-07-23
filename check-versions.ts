// @ts-expect-error - Meteor package imports are not typed
import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions(
  {
    'zod': '^4.0.0',
  },
  'typed:model',
);

