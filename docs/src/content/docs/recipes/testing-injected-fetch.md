---
title: Test with injected fetch
description: Assert URLs, request bodies, and failures without making network requests.
sidebar:
  order: 5
---

Inject an `HttpFetch` instead of replacing global fetch. This Vitest test exercises URL building, serialization, response shaping, and HTTP error handling entirely in memory.

```ts
import { expect, it } from "vitest";
import { Http, rest, ServiceError } from "@tuentyfaiv/http";
import type { HttpFetch } from "@tuentyfaiv/http";

it("creates a user and reports a failed request", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    const failed = calls.length > 1;
    return new Response(
      JSON.stringify(failed ? { message: "Unavailable" } : { id: "u1" }),
      {
        status: failed ? 503 : 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  const api = Http.create("https://api.test/v1", {
    preset: rest,
    cache: false,
    fetch,
    retry: 0,
  });

  const result = await api.post<{ name: string }, { id: string }>("/users", {
    name: "Ana",
  });

  expect(result.data).toEqual({ id: "u1" });
  expect(result.status).toBe(201);
  expect(calls[0]?.url).toBe("https://api.test/v1/users");
  expect(calls[0]?.init?.method).toBe("POST");
  expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Ana" }));
  expect(new Headers(calls[0]?.init?.headers).get("Content-Type"))
    .toBe("application/json");

  await expect(api.get("/users")).rejects.toBeInstanceOf(ServiceError);
  expect(calls).toHaveLength(2);
});
```

## Keep the fake realistic

- `HttpFetch` accepts a URL string and optional `RequestInit`, and returns `Promise<Response>`. Construct a fresh `Response` for each call: response bodies can only be consumed once.
- `cache: false` prevents another test's client for the same URL from retaining a different fetch or preset. Automatic retry is off by default; `retry: 0` makes that choice explicit here.
- Include `Content-Type` in mock responses: the default `responseType: "auto"` uses response metadata to select parsing. This recipe uses `rest`, so `result.data` is the full JSON body, not an unwrapped `data` field.
- Without an injected fetch, the client resolves `globalThis.fetch` at request time.
- To test timeouts or cancellation, the fake must reject with `init.signal.reason` if the signal is already aborted, or listen for its `abort` event. A fake that ignores signals cannot demonstrate transport cancellation.

This test does not cover CORS, cookies, or a real server. Keep separate integration tests for those boundaries.

Related: [shared typed client](../shared-typed-client/) and [single-flight token refresh](../auth-refresh/).
