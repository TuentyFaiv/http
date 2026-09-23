---
title: Validation
description: Validate unwrapped response data with a Standard Schema validator.
sidebar:
  order: 5
---

A TypeScript generic describes expected data; it cannot check a server response.
Pass a [Standard Schema v1](https://standardschema.dev) validator as `schema` for
runtime validation. Compatible versions of Zod, Valibot, and ArkType can supply
one; install your chosen validator separately. The HTTP client adds no validation dependency.

## Validate a payload

This complete, dependency-free schema demonstrates the contract. In an application,
you can replace it with a schema from your preferred validator.

```ts
import { Http, ServiceError } from "@tuentyfaiv/http";
import type { InferSchemaOutput, StandardSchemaV1 } from "@tuentyfaiv/http";

const userSchema: StandardSchemaV1<unknown, { id: number; name: string }> = {
	"~standard": {
		version: 1,
		vendor: "app",
		validate(value) {
			if (
				typeof value === "object" &&
				value !== null &&
				"id" in value &&
				typeof value.id === "number" &&
				"name" in value &&
				typeof value.name === "string"
			) {
				return { value: { id: value.id, name: value.name.trim() } };
			}
			return { issues: [{ message: "Expected a user with a numeric id and a name" }] };
		},
	},
};

type User = InferSchemaOutput<typeof userSchema>;
const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get<User>("/me", { schema: userSchema });
console.log(payload.name);
```

The method currently does **not** infer its result generic from `schema`. Supply
`User` (or your validator's output type) explicitly. A transform's output type,
not its input type, belongs in that generic.

## What is validated

With the default `envelope` preset, this response:

```json
{ "data": { "id": 7, "name": " Ada " } }
```

passes `{ id: 7, name: " Ada " }` to the schema. The example above returns
`{ id: 7, name: "Ada" }` as `payload`.

Validation uses the preset's `unwrap` keys. `bare` and `rest` do not unwrap by default,
so their schemas receive the whole parsed body. Async validators are supported.
For JSON payloads, schema output replaces the unwrapped value, allowing transforms,
coercions, and defaults supplied by your validator.

:::note[Current scope]
This validates response data, not request bodies. The default envelope preset builds
text, binary, and stream results from the parsed body directly, so schema transforms
are not applied to those returned payloads. Prefer this workflow for JSON data;
custom presets should use their supplied `unwrap` callback.
:::

## Handle validation failures

Continuing with the client and schema above:

```ts
const [error, result] = await api.safe.get<User>("/me", { schema: userSchema });

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
