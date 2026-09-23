---
title: Presets
description: Choose the result shape and the API conventions that reject a response.
sidebar:
  order: 2
---

A preset validates the parsed response and builds the returned value. Switching
presets changes both runtime behavior and TypeScript return types, not how Fetch sends the request.

## Choose a preset

| Preset | Returns | Rejects when |
| --- | --- | --- |
| `envelope` (default) | `{ success, message, payload, response }` | An API failure convention matches or the HTTP status is outside 2xx. |
| `bare` | The parsed body | HTTP status is outside 2xx. |
| `rest` | `{ data, status, headers, response }` | HTTP status is outside 2xx. |
| `problem` | The parsed body | HTTP status is outside 2xx; reads RFC 9457 problem details when available. |

Only `envelope` unwraps `data` or `payload` by default. For `bare`, `rest`, and
`problem`, the payload type must describe the entire parsed body.

```ts
import { bare, Http, rest } from "@tuentyfaiv/http";

type User = { id: number; name: string };

const api = Http.create("https://api.example.com", { cache: false });
const wrapped = await api.get<User>("/me");
console.log(wrapped.payload.name);

const raw = Http.create("https://api.example.com", { cache: false, preset: bare });
const user = await raw.get<User>("/me");
console.log(user.name);

const restful = Http.create("https://api.example.com", { cache: false, preset: rest });
const result = await restful.get<User>("/me");
console.log(result.data.name, result.status, result.headers.get("ETag"));
```

Use `cache: false` here: otherwise the same base URL reuses the first client,
ignoring subsequent preset choices.

## Envelope conventions

Matchers run in order; the first match rejects, even on HTTP 200:

1. `errorField()`: truthy `error` with falsy or missing `result`.
2. `detailField()`: truthy `detail` whose `success` is falsy or missing.
3. `payloadField()`: truthy `payload` with falsy or missing top-level `success`.
4. `errorsField()`: truthy `errors` (including empty arrays and objects).
5. `statusFallback()`: HTTP status outside 2xx.

These are truthiness checks, not strictly `success === false`. For example,
`{ payload: { id: 1 } }` is rejected without a truthy `success`. Use a different
preset or customize the conventions if this does not match your API.

`envelope` tries `data`, then `payload`, taking the first non-null/undefined value.
It does not recursively unwrap. If neither exists, it keeps the body.

## Extend an existing preset

`extend` creates a new preset without changing the original. Override `unwrap`
keys or replace the convention list; spread the old list to retain its checks.

```ts
import { envelope, Http, toErrorInit } from "@tuentyfaiv/http";
import type { ConventionMatcher } from "@tuentyfaiv/http";

const rejectWarnings: ConventionMatcher = (context, json) =>
	json.warning ? toErrorInit(context, { message: "API warning", errors: [] }) : undefined;

const strict = envelope.extend({
	name: "strict",
	unwrap: ["result"],
	conventions: [rejectWarnings, ...envelope.conventions],
});

const api = Http.create("https://api.example.com", { cache: false, preset: strict });
await api.get<{ id: number }>("/me");
```

## Build a custom result shape

Register the shape through declaration merging, then supply a typed `build` function.
Keep `statusFallback()` unless accepting failed HTTP statuses is intentional.

```ts
import { createPreset, Http, statusFallback } from "@tuentyfaiv/http";
import type { ApplyShape, ResponseContext, Unwrap } from "@tuentyfaiv/http";

declare module "@tuentyfaiv/http" {
	interface HttpShapes<T> {
		traced: { data: T; traceId: string | null };
	}
}

const traced = createPreset({
	name: "traced",
	shape: "traced",
	conventions: [statusFallback()],
	unwrap: ["result"],
	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"traced", T> {
		return {
			data: unwrap(context.body) as T,
			traceId: context.response.headers.get("X-Trace-Id"),
		};
	},
});

const api = Http.create("https://api.example.com", { cache: false, preset: traced });
const result = await api.get<{ id: number }>("/me");
console.log(result.data.id, result.traceId);
```

Use the supplied `unwrap` callback in `build` so [schema validation](../validation/)
can supply a transformed payload. For a one-request validation override, see
[`thrower`](../errors/#override-validation-for-one-request).
