---
title: Requests and responses
description: Send query parameters, JSON, forms, and headers, then choose how to read the response.
sidebar:
  order: 1
---

## Methods and types

`get` and `head` accept configuration as their second argument. `post`, `put`,
`patch`, `delete`, and `options` accept an optional body second and configuration third.
The following snippets share this client and these types:

```ts
import { ContentType, Http } from "fetchzen";

type User = { id: number; name: string };
type CreateUser = { name: string };
const api = Http.create("https://api.example.com/v1", { cache: false });

await api.get<User>("/users/1");
await api.post<CreateUser, User>("/users", { name: "Ada" });
await api.delete<undefined, undefined>("/users/1", undefined, { timeout: 2_000 });
```

For GET/HEAD, generics are `<Result, Params>`; for the other methods and `request`,
they are `<Body, Result, Params>`. A result type describes the payload inside the
chosen [preset](../presets/), not the whole return object. It is not runtime validation.

The same call can use the explicit primitive:

```ts
await api.request<CreateUser, User>({
	method: "POST",
	endpoint: "/users",
	body: { name: "Ada" },
});
```

## URLs and query parameters

A leading slash on the endpoint preserves the base path (`/v1` here). Absolute
endpoints override the base URL. Existing query strings are preserved, and serialized
parameters are appended; an existing query key can therefore appear more than once.

```ts
type Search = { page: number; tag: string[]; active: boolean };
const params: Search = { page: 2, tag: ["staff", "editor"], active: false };

await api.get<User[]>("/users", { params });
// /v1/users?page=2&tag=staff&tag=editor&active=false
```

Arrays repeat the key, objects become JSON strings, and `null`/`undefined` values
are omitted. Instance parameters and request parameters merge by key, with the
request winning. Query objects work with an explicit result generic without another
generic argument. You can still pass `get<User[], Search>` for stricter parameter
checking on that call.

For a different encoding, set `paramsSerializer` on the instance or request. It
receives a `Record<string, unknown>` and returns a query string without `?`.

## Request bodies

Plain objects and arrays are JSON-serialized by default. Strings, `Blob`,
`ArrayBuffer`, typed arrays, and `ReadableStream` bodies pass through unchanged.
Set the matching content type for raw text or binary data; the default is JSON.
`null` and `undefined` send no body, rather than JSON `null`.

```ts
await api.post("/notes", "Hello", { type: ContentType.TEXT_PLAIN });

const form = new FormData();
form.append("name", "Ada");
form.append("avatar", new Blob(["image bytes"]), "avatar.bin");
await api.post("/profile", form);

await api.post("/preferences", new URLSearchParams({ theme: "dark" }));
```

`FormData` removes the explicit `Content-Type` so Fetch can add its multipart boundary.
`URLSearchParams` uses `application/x-www-form-urlencoded` unless you set another
non-JSON content type. A plain object with `type: ContentType.APPLICATION_FORM_DATA`
is converted to `FormData`; arrays use indexed keys such as `tag[0]`.

## Headers and authentication

Instance and per-request headers accept any `HeadersInit`: records, entry arrays,
or `Headers` instances.

```ts
await api.get<User>("/me", {
	headers: { "Accept-Language": "en-US" },
	credentials: "include",
});
```

Request headers override matching instance headers. GET/HEAD remove `Content-Type`.
`secure` defaults to `true`; `secure: false` removes `Authorization`. It does **not**
enforce HTTPS, disable cookies, or change TLS verification. Fetch controls cookies
through `credentials` and browser policy.

:::caution[Absolute URLs keep instance defaults]
An absolute endpoint still receives the client's default headers and parameters.
Do not send an authenticated client to an untrusted origin. Use a separate client
without credentials instead.
:::

## Response parsing

`responseType` controls parsing independently of the preset:

| Value | Payload before preset shaping |
| --- | --- |
| `auto` (default) | Inferred from status, body availability, and `Content-Type`. |
| `json` | Parsed JSON; an empty body produces `undefined`. |
| `text` | `string` |
| `blob` | `Blob` |
| `arrayBuffer` | `ArrayBuffer` |
| `stream` | `ReadableStream<Uint8Array> \| null`; you consume it. |
| `none` | `undefined`; skips reading the body, not status validation. |

```ts
const { payload: csv } = await api.get("/export", { responseType: "text" });
const { payload: file } = await api.get("/archive", { responseType: "blob" });
const { response } = await api.head<undefined>("/health");
console.log(csv.length, file.size, response.status);
```

Without explicit result generics, literal `responseType` options infer the native
payload type shown above for normal methods, safe methods, and `request()`.
`auto` and `json` remain `unknown` unless you supply a result type or
[schema](../validation/). A schema's output takes precedence over the raw mode,
including transforms. Use `responseType: "arrayBuffer"` when you need bytes
rather than a `Blob`.

`auto` recognizes JSON (including `+json`), supported text and binary media types,
and empty responses such as 204/205. A 304 has no parsed body but still fails the
shipped presets' non-2xx check. Missing `Content-Type` is treated as JSON; for unknown
media types, set `responseType` explicitly.

JSON and text responses are cloned by default, so `result.response` can be read
again. Binary bodies are consumed without cloning; use `clone: true` only if you
need a second copy. `clone: false` avoids the extra branch for JSON/text too.
Cloning large or streaming bodies can buffer substantial data if one branch is not consumed.

## Without a base URL

```ts
import http from "fetchzen";

await http.get("https://api.example.com/health");
```

The default export has no base URL. Browser-relative endpoints work too; server
runtimes generally require an absolute URL.

## Helpers without client initialization

```ts
import { buildUrl } from "fetchzen/helpers";

const url = buildUrl({
  baseUrl: "https://api.example.com",
  endpoint: "/users",
  params: { page: 2 },
});
```

The `helpers` entry exports utilities, errors, presets, conventions, and their
types without creating the default client or initializing its registry. It has
no default export or `Http` constructor. Its named exports have the same
function/class/preset identities as the root entry; bundlers can remove unused
helpers. Import clients from `fetchzen`.

Continue with [errors](../errors/) and [download progress](../resilience/),
or try [JSON](../../examples/json/) and [multipart](../../examples/multipart/).
