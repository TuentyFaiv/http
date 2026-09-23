---
title: Single-flight token refresh
description: Share one in-flight refresh and replay authenticated reads once.
sidebar:
  order: 2
---

This browser recipe keeps the access token in memory. It assumes `/refresh` uses an HttpOnly refresh cookie and returns JSON `{ "token": "..." }`. Configure cookie, CORS, and CSRF protections on your server; `credentials: "include"` does not provide those protections by itself.

```ts
import { Http, rest } from "@tuentyfaiv/http";
import type { HttpFetch } from "@tuentyfaiv/http";

export function createSessionClient(
  initialToken: string,
  transport: HttpFetch = (url, init) => globalThis.fetch(url, init),
) {
  let token = initialToken;
  let refreshing: Promise<string> | undefined;
  const base = "https://api.example.com";
  const auth = Http.create(base, {
    preset: rest,
    cache: false,
    fetch: transport,
    timeout: 10_000,
    retry: 0,
  });
  const api = Http.create(base, {
    preset: rest,
    cache: false,
    fetch: transport,
    retry: 0,
  });

  function refreshToken(): Promise<string> {
    refreshing ??= auth
      .post<undefined, { token: string }>("/refresh", undefined, {
        credentials: "include",
      })
      .then(({ data }) => {
        if (typeof data?.token !== "string" || !data.token) {
          throw new Error("Refresh response is missing a token");
        }
        token = data.token;
        return token;
      })
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  }

  api.hook("request", ({ init }) => {
    init.headers.set("Authorization", `Bearer ${token}`);
  });

  api.hook("response", async (response, { url, init }) => {
    if (response.status !== 401 || !["GET", "HEAD"].includes(init.method)) {
      return;
    }

    init.signal?.throwIfAborted();
    const sentToken = init.headers.get("Authorization");
    // A late 401 may belong to the token we already replaced.
    const nextToken = sentToken === `Bearer ${token}`
      ? await refreshToken()
      : token;
    init.signal?.throwIfAborted();

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${nextToken}`);
    return transport(url, { ...init, headers });
  });

  return api;
}
```

## Why this stops after one replay

Response hooks run before body parsing and preset validation. Returning the replay's `Response` lets the normal pipeline validate it; a second 401 rejects with `ServiceError` under `rest`.

The direct transport call does **not** re-enter client hooks or automatic retries. No replay header is needed. Using the same injected transport also keeps the replay testable. Error hooks can observe or replace an error, not recover with a successful response.

Both clients use `cache: false`: otherwise the identical base URL would make them the same cached instance. The refresh client has no refresh hook, avoiding recursion. Only overlapping refreshes share a promise; after it settles, a later failure can start another refresh.

## Boundaries

- Only GET/HEAD requests are replayed. Retrying writes needs a server-side idempotency contract; consumed stream bodies cannot simply be reused.
- A caller's signal is preserved for the replay, but does not cancel the shared refresh. That call has its own 10-second timeout. Cancellation is checked again after waiting.
- Refresh failures propagate; HTTP failures, network failures, and timeouts are not all `ServiceError`. Decide at the call site whether to show an error or require sign-in.
- Create one client per signed-in session and discard it on logout. Do not share this token closure between users on a server, and use it only for trusted API endpoints.

Related: [shared typed client](../shared-typed-client/) and [cancelling stale requests](../cancelling-stale-requests/).
