---
title: Share a typed client
description: Centralize API configuration and expose small typed endpoint functions.
sidebar:
  order: 1
---

Export one configured client from a module rather than recreating it at each call site. This example expects plain JSON objects and arrays, so it selects `rest` explicitly.

```ts
import { Http, rest } from "@tuentyfaiv/http";

export interface User {
  id: string;
  name: string;
}

type CreateUser = Pick<User, "name">;
type UserQuery = { page: number };

export const api = Http.create("https://api.example.com/v1", {
  preset: rest,
  cache: false,
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

`Http.create()` caches by base URL by default. A later call with the same URL returns the existing client, ignoring the new configuration—even a different preset or injected `fetch`. `cache: false` avoids that registry; exporting the client still shares this module's instance.

On a server, create a separate uncached client per user request if headers or hook closures contain user credentials. Do not keep user-specific state in a module singleton.

Next: [refresh authentication](../auth-refresh/) or [test with injected fetch](../testing-injected-fetch/).
