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
import { ContentType, Http } from "@tuentyfaiv/http";

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

await api.get<User[], Search>("/users", {
	params: { page: 2, tag: ["staff", "editor"], active: false },
});
// /v1/users?page=2&tag=staff&tag=editor&active=false
```

Arrays repeat the key, objects become JSON strings, and `null`/`undefined` values
are omitted. Instance parameters and request parameters merge by key, with the
request winning. If you supply the result generic, also supply the parameter type
when using `params` (the default parameter type is `undefined`).

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

Instance headers accept any `HeadersInit`. **Per-request headers are currently typed
as `Headers`**, so construct them explicitly:

```ts
await api.get<User>("/me", {
	headers: new Headers({ "Accept-Language": "en-US" }),
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
const { payload: csv } = await api.get<string>("/export", { responseType: "text" });
const { payload: file } = await api.get<Blob>("/archive", { responseType: "blob" });
const { response } = await api.head<undefined>("/health");
console.log(csv.length, file.size, response.status);
```

`auto` recognizes JSON (including `+json`), supported text and binary media types,
and empty responses such as 204/205. A 304 has no parsed body but still fails the
shipped presets' non-2xx check. Missing `Content-Type` is treated as JSON; for unknown
media types, set `responseType` explicitly.

JSON and text responses are cloned by default, so `result.response` can be read
again. Binary bodies are consumed without cloning; use `clone: true` only if you
need a second copy. `clone: false` avoids the extra branch for JSON/text too.
Cloning large or streaming bodies can buffer substantial data if one branch is not consumed.

Continue with [errors](../errors/) and [download progress](../resilience/).
