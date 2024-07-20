# Meteor Typed Model

A Zod validated, type safe wraper around Meteor Mongo Collections.

## Package Status

This package is currently a WIP. Documentation is incomplete and there are no automated tests. That being said, the code is reliable and has been extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project.

## Installation

Install `typed:model` and `zod`:

```bash
meteor add typed:model
meteor npm install zod
```

## Usage

```typescript
import { Model, CustomTypes, SchemaHelpers } from 'meteor/typed:model';
import type { ModelType } from 'meteor/typed:model';
import { z } from 'zod';

const { nonEmptyString } = CustomTypes;
const { withCommon } = SchemaHelpers;

const Link = withCommon(
  z.object({
    title: nonEmptyString,
    url: z.string().url(),
  })
);

export const LinkModel = new Model('link', Link);
export type LinkType = ModelType<typeof LinkModel>;
```

## Attribution

This package is composed mostly of code extracted from the [JollyRoger](https://github.com/deathandmayhem/jolly-roger) project created by Evan Broder.
