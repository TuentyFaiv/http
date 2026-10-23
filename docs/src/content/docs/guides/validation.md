---
title: Validation
description: Validate response data with Zod or Valibot and infer its TypeScript type.
sidebar:
  order: 5
---

A TypeScript generic describes expected data; it cannot check a server response.
Pass a Zod or Valibot schema to validate the response and infer its type.
Both support [Standard Schema v1](https://standardschema.dev), so no adapter is needed.
Install your chosen validator in your app; the HTTP client has no validation dependency.

## With Zod

Install Zod 4:

```sh
bun add zod@4
```

```ts
import { Http } from "fetchzen";
import { z } from "zod";

const userSchema = z.object({
	id: z.number(),
	name: z.string().trim(),
});

const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get("/me", { schema: userSchema });
console.log(payload.name); // Inferred as string; whitespace is trimmed.
```

## With Valibot

Install Valibot 1:

```sh
bun add valibot@1
```

```ts
import { Http } from "fetchzen";
import * as v from "valibot";

const userSchema = v.object({
	id: v.number(),
	name: v.pipe(v.string(), v.trim()),
});

const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get("/me", { schema: userSchema });
console.log(payload.name); // Inferred as string; whitespace is trimmed.
```

## Inferred types

The result is inferred from the schema's **output**, including transforms, not
its input. Leave generics off to use this inference; the request body is inferred
from its argument too. Normal methods, safe methods, and `request()` follow the
same rule. Use `InferSchemaOutput<typeof userSchema>` if you need a named output type.
Without a guaranteed schema or explicit response mode, the inferred payload stays
`unknown`; optional or broadly typed schema options do not establish a validated type.

## What is validated

With the default `envelope` preset, this response:

```json
{ "data": { "id": 7, "name": " Ada " } }
```

passes `{ id: 7, name: " Ada " }` to the schema. Both examples return
`{ id: 7, name: "Ada" }` as `payload`.

Validation uses the preset's `unwrap` keys. `bare` and `rest` do not unwrap by default,
so their schemas receive the whole parsed body. Async validators are supported.
Schema output replaces the payload for every response mode, allowing transforms,
coercions, and defaults supplied by your validator. Output such as `undefined`,
`null`, `false`, `0`, or `""` is preserved rather than replaced by the original body.

:::note[Current scope]
This validates response data, not request bodies. Parsing still happens first:
for example, `responseType: "text"` gives the validator a string. A supplied schema
determines the final payload type rather than the raw response mode. Custom presets
should use their supplied `unwrap` callback to preserve validated output.
:::

## Handle validation failures

Continue with the client and schema from either example:

```ts
import { ServiceError } from "fetchzen";

const { data: result, error } = await api.safe.get("/me", { schema: userSchema });

if (error instanceof ServiceError && error.code === "ERR_SCHEMA") {
	console.error(error.errors);
} else if (error) {
	console.error(error.message);
} else {
	console.log(result.payload.name);
}
```

Returned issues become a `ServiceError` with `code: "ERR_SCHEMA"`; paths and messages
are flattened into strings in `errors`. If the validator itself throws, its error
follows the normal error path instead of becoming `ERR_SCHEMA`.

The pipeline is **parse → preset validation (or thrower) → schema → result**.
A normally parsed HTTP 500 fails before the schema runs. Invalid JSON fails even
earlier. A custom `thrower` can change which HTTP responses reach the schema.
See [errors](../errors/) and [custom presets](../presets/).
Try [validation](../../examples/validation/) and [transforms](../../examples/transforms/).
