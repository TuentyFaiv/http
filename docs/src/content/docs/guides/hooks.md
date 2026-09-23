---
title: Hooks
description: Observe or replace requests, responses, and errors, and configure logging.
sidebar:
  order: 3
---

Hooks are registered on a client, run in registration order, and may be synchronous
or async. They are not per-request configuration options.

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", {
	cache: false,
	hooks: {
		request: [
			({ url, init }) => {
				init.headers.set("X-Request-Id", crypto.randomUUID());
				return { url, init };
			},
		],
		response: [
			(response) => {
				console.info("HTTP status", response.status);
			},
		],
		error: [
			(error) => {
				console.error(error.message);
			},
		],
	},
});

await api.get("/users");
```

## Hook contracts

| Hook | Receives | Return value |
| --- | --- | --- |
| `request` | `{ url, init }`, after headers, body, and URL preparation | A context replaces URL/init; a `Response` skips the network and remaining request hooks. |
| `response` | `(response, context)`, before parsing and preset validation | A `Response` replaces the response used by later hooks and parsing. |
| `error` | `(error, context)` | An `Error` replaces the error thrown to the caller. |

Returning nothing keeps the current context, response, or error. Error hooks do
not recover a successful result; the request still rejects (or returns the error
slot through `safe`). Request hooks run once, not on each retry. Response hooks
see the final response, not intermediate retry responses.

:::caution[Do not consume the response in an observer]
Read `response.clone()` if a response hook needs the body. Reading the original
consumes it before the client can parse it. Cloning large bodies can increase memory use.
:::

## Register and remove a hook

Using the client above, `hook()` returns an unsubscribe function. Remove temporary
hooks when their owner is disposed to avoid duplicate handlers on long-lived clients.

```ts
const off = api.hook("request", ({ init }) => {
	init.headers.set("X-Feature", "preview");
});

await api.get("/users");
off();
```

## Return a local response

A request hook can return a normal Fetch `Response`. Response hooks, parsing,
preset validation, and schema validation still run:

```ts
const offLocal = api.hook("request", ({ url }) => {
	if (new URL(url).pathname === "/health") {
		return Response.json({ data: { healthy: true } });
	}
});

await api.get("/health");
offLocal();
```

Create a fresh response or clone a stored one for each request; a consumed response
cannot be reused. This is a transport override, not built-in response caching.

## Logging

Logging is separate from hooks and off by default. Enable it with `log: true` on
the instance or request. A custom logger is configured on the instance:

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", {
	cache: false,
	log: true,
	logger: {
		request: ({ init }) => console.debug(init.method),
		response: ({ response, duration }) => console.debug(response.status, duration),
		error: ({ error }) => console.error(error.name),
	},
});

await api.get("/health");
```

`duration` is milliseconds through body parsing, not just network latency. A
response log occurs before preset/schema validation, so it can be followed by an error log.

The built-in logger redacts `authorization`, `proxy-authorization`, `cookie`,
`set-cookie`, `x-api-key`, and `x-auth-token` headers. **URLs, bodies, and error details
are not redacted.** Custom loggers receive unredacted data; use `redactHeaders`
when logging headers and apply your own policy to other fields.

See [errors](../errors/) for error identity and [retries](../resilience/) for retry behavior.
