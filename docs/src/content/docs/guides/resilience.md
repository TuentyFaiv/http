---
title: Timeouts, retries, and progress
description: Cancel requests, choose a retry policy, and observe download progress.
sidebar:
  order: 6
---

## Timeouts and cancellation

Set `timeout` in milliseconds on the instance or a request. A request value overrides
the instance default; `timeout: 0` disables the inherited timeout.

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false, timeout: 5_000 });
const controller = new AbortController();
const pending = api.safe.get("/slow", { timeout: 1_000, signal: controller.signal });

controller.abort();
const [error] = await pending;
console.log(error?.name);
```

The timeout signal composes with your signal, so either can abort Fetch. The timer
is created once for the whole request, not once per retry. Timeout uses
`TimeoutError`; `controller.abort()` normally uses `AbortError`. Calling
`abort(reason)` can produce a different error.

:::caution[Cancellation is cooperative]
Custom transports must honor `init.signal`. Hooks are not interrupted by the client,
and retry-delay timers are not abort-aware: aborting during backoff may not settle
the promise until the delay finishes. A timeout is not a hard deadline for every callback.
:::

## Retries

Retries are **off by default**. Using the client above:

```ts
await api.get("/users", { retry: 2 });
await api.get("/health", { retry: 0 });

await api.get("/report", {
	retry: { attempts: 3, delay: 250, statusCodes: [429, 503] },
});
```

`attempts` counts retries after the first send: `2` allows up to three sends.
`retry: 0` disables an instance retry policy.

| Option | Default |
| --- | --- |
| `methods` | `GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS` |
| `statusCodes` | `408`, `429`, `500`, `502`, `503`, `504` |
| `delay` | Exponential backoff from 300 ms, base capped at 10 seconds, plus 0–99 ms jitter. |
| `respectRetryAfter` | `true` |

`delay` may also be `(attempt, response) => milliseconds`; attempts are zero-based,
and `response` is absent after a transport error. A valid `Retry-After` (seconds or
HTTP date) takes precedence over the delay. It is not capped by the default backoff ceiling.

Retries apply to allowed methods and matching HTTP statuses or transport failures.
Errors named `AbortError` and `TimeoutError` are not retried. Parsing, preset, and
schema failures happen after sending and are not retried.

:::caution[Replay safety]
POST/PATCH are excluded by default. Add them to `methods` only when your server's
idempotency contract makes replay safe. Do not enable retries for streamed request
bodies: the client cannot rewind them and does not automatically disable retries.
Request hooks run once, so a retry reuses the prepared body, headers, and URL.
:::

## Download progress

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get<Blob>("/export.zip", {
	responseType: "blob",
	onDownloadProgress: ({ loaded, total, percent, done }) => {
		console.log({ loaded, total, percent, done });
	},
});
console.log(payload.size);
```

`loaded` is bytes read. `total` and `percent` (0–100) are available when a usable
`Content-Length` is present; otherwise use an indeterminate indicator. `done`
marks completion of stream consumption, not success of subsequent validation.

Progress follows body consumption. JSON, text, blob, and arrayBuffer modes consume
automatically. With `responseType: "stream"`, consume the returned stream yourself;
with `none`, the client does not read the body. Progress describes the final response,
not all retry traffic. Upload progress is not supported.

See [requests and responses](../requests-responses/) for parsing and cloning options.
