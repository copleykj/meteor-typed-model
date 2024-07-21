// @ts-expect-error
import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';

checkNpmVersions(
  {
    'zod': '3.23.x',
  },
  'typed:model',
);

