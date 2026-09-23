---
title: Errors
description: Inspect service failures, preserve native errors, and use safe result tuples.
sidebar:
  order: 4
---

HTTP/API failures recognized by a preset, invalid JSON, and schema failures use
`ServiceError`. Network failures, cancellation, and your own thrown `Error` objects
are not converted to `ServiceError`.

## Handle a rejected request

```ts
import { Http, ServiceError } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });

try {
	await api.get("/users/1");
} catch (error) {
	if (error instanceof ServiceError) {
		console.error(error.status, error.message, error.errors);
	} else if (error instanceof Error && error.name === "AbortError") {
		console.info("Request canceled");
	} else {
		throw error;
	}
}
```

| Property | Meaning |
| --- | --- |
| `message`, `status`, `statusText` | Details selected by the preset; API fields may override the HTTP status. |
| `errors` | A string, string array, or object with an optional `description`. |
| `code` | Optional machine-readable code; not every API code is copied here. |
| `response` | Optional Fetch `Response`; use `response.status` for the actual HTTP status. |
| `request` | Optional `{ url, method }`; included for normal preset and schema failures. |
| `cause` | Original error when available, such as a JSON parsing `SyntaxError`. |

`toJSON()` includes diagnostic fields and request metadata, but omits `response`
and `cause`. Review messages, URLs, and error details before sending them to a log service.

Existing `Error` instances keep their identity, stack, and cause unless an error
hook replaces them. Non-Error thrown values are wrapped in an `Error` with the
original value as `cause`.

## Use an error/result tuple

Each HTTP method has a `safe` counterpart with the same arguments and preset shape:

```ts
import { Http, ServiceError } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });
const [error, result] = await api.safe.get<{ id: number }>("/me");

if (error) {
	console.error(error.message);
	if (error instanceof ServiceError) {
		console.error(error.status, error.errors);
	}
} else {
	console.log(result.payload.id);
}
```

The tuple is `[Error, undefined]` or `[undefined, result]`. Narrow the error before
accessing `ServiceError`-specific properties. `safe` does not disable validation or
error hooks. It wraps the HTTP helpers only: **`api.safe.request()` is not a safe
tuple-returning primitive**; use a helper or catch `api.request()` yourself.

## Reserved codes

| Code | Meaning |
| --- | --- |
| `ERR_INVALID_JSON` | JSON parsing failed. `errors.description` holds up to the first 200 characters; `cause` is the parsing error. |
| `ERR_SCHEMA` | Schema validation returned issues, flattened into `errors`. |

Body parsing runs before preset validation. Invalid JSON on a 500 response can
therefore produce `ERR_INVALID_JSON` instead of the preset's HTTP error.
A timeout normally has the name `TimeoutError`; default caller cancellation uses
`AbortError`. A caller may supply another abort reason. See [resilience](../resilience/).

## Override validation for one request

A synchronous `thrower` **replaces** preset validation, including its HTTP status
check. Delegate to `presetThrower` to keep the usual checks:

```ts
import { envelope, Http, presetThrower, ServiceError } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });
const fallback = presetThrower(envelope);

await api.get("/legacy", {
	thrower: ({ json, response }) => {
		if (json.legacyError) {
			throw new ServiceError({
				message: "Legacy API failure",
				status: response.status,
				statusText: response.statusText,
				errors: [],
				response,
			});
		}
		fallback({ json, response });
	},
});
```

Use the client's actual preset when constructing the fallback. For non-JSON
responses, `json` is an empty object. Schema validation still follows the thrower.
For reusable API rules, prefer [preset conventions](../presets/).
