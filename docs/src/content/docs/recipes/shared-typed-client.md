---
title: Share a typed client
description: Centralize API configuration and expose small typed endpoint functions.
sidebar:
  order: 1
---

Export one configured client from a module rather than recreating it at each call site. This example expects plain JSON objects and arrays, so it selects `rest` explicitly.

```ts
import { Http, rest } from "fetchzen";

export interface User {
  id: string;
  name: string;
}

type CreateUser = Pick<User, "name">;
type UserQuery = { page: number };

export const api = Http.create("https://api.example.com/v1", {
  preset: rest,
  timeout: 10_000,
  headers: { Accept: "application/json" },
});

export async function listUsers(page = 1): Promise<User[]> {
  const { data } = await api.get<User[], UserQuery>("/users", {
    params: { page },
  });
  return data;
}

export async function createUser(input: CreateUser): Promise<User> {
  const { data } = await api.post<CreateUser, User>("/users", input);
  return data;
}
```

- `get<Response, Params>` takes options as its second argument; `post<Body, Response>` takes the body second and options third. Objects are JSON-serialized by default.
- `/users` is appended to the base path: the first list call requests `https://api.example.com/v1/users?page=1`.
- `rest` returns `{ data, status, headers, response }` without unwrapping JSON fields. The default preset is `envelope`, which exposes `payload` and unwraps `data` or `payload`.
- Generics describe the expected payload; they do **not** validate server data. Use a per-request `schema` compatible with Standard Schema when runtime validation is needed.
- There is no timeout and no automatic retry by default. The 10-second timeout above is an explicit application choice.

## Share deliberately

`Http.create(baseUrl, config?)` shares clients by the exact base URL string by
default. A compatible lookup returns the exact same client and hooks; configuration
only initializes a new client. Later calls do not reset or merge defaults or hooks,
including an injected `fetch`.

The original preset is fixed for the client's lifetime. An explicitly different
preset object throws even with the same shape. Omitting `preset` asserts the default
`envelope` shape, so a lookup of a non-envelope client must pass its original
preset again. Prefer reusing the exported typed instance; retain the original custom
preset object rather than recreating it with `extend()` at each lookup.

```ts
const sameApi = Http.create("https://api.example.com/v1", { preset: rest });
console.log(sameApi === api); // true

sameApi.configure({ timeout: 5_000 });
// Future requests through api also use the new timeout.
```

The registry lives in memory only, without browser persistence or sharing across
tabs or processes. This is not XSS protection. `cache: false` creates a private
client without reading or writing the registry; exporting that client still
shares the module's instance.

## Update defaults for future requests

Use `api.configure(update)` on the existing client; it returns `void`.
It accepts `headers`, `params`, `secure`, `errorMessage`, `log`, `timeout`,
`retry`, `fetch`, `paramsSerializer`, and `logger`.

```ts
api.configure({
  headers: { "Accept-Language": "es-MX" },
  params: { locale: "es-MX" },
  timeout: undefined,
});
```

Supplied fields replace previous values (including entire
headers/params collections); omitted fields remain, and explicit `undefined` resets
to built-in fallbacks. Per-request options still win. Every request snapshots defaults
and hook lists at its start, so changes apply to later requests, not pending ones.
Callback closure state remains application-owned.

`configure` does not accept `preset`, `cache`, or `hooks`. Use
[`hook(name, handler)` and its unsubscribe function](../../guides/hooks/) for hooks.
Request headers/params merge with defaults by key. Pass Fetch options such as
`credentials`, `signal`, or Fetch's response `cache` option on the request, not
to `create` or `configure`; that `cache` is separate from the client registry.

## Isolate server requests

On a server, create a separate private client with `cache: false` per user request
for user-specific configuration or hooks. Do not keep user-specific state in a
module/global shared client. The same isolation option is useful for tests and
multiple independent clients at one URL.

Next: [refresh authentication](../auth-refresh/), [test with injected fetch](../testing-injected-fetch/),
or try [configuration](../../examples/configuration/).
