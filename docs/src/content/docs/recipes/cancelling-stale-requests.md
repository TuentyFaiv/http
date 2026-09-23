---
title: Cancel stale requests
description: Abort the previous search and prevent late results from updating the UI.
sidebar:
  order: 3
---

Use one controller per search and a latest-request check. Cancellation saves work when the transport supports it; the identity check also prevents stale results from updating the UI.

```ts
import { Http, rest } from "@tuentyfaiv/http";

interface SearchItem {
  id: string;
  title: string;
}

export function createSearch(
  render: (items: SearchItem[]) => void,
  reportError: (error: unknown) => void,
) {
  const api = Http.create("https://api.example.com", {
    preset: rest,
    cache: false,
  });
  let active: AbortController | undefined;

  async function search(query: string): Promise<void> {
    active?.abort();
    const controller = new AbortController();
    active = controller;

    try {
      const { data } = await api.get<SearchItem[], { q: string }>("/search", {
        params: { q: query },
        signal: controller.signal,
        timeout: 5_000,
      });
      if (active === controller && !controller.signal.aborted) {
        render(data);
      }
    } catch (error) {
      if (active !== controller || controller.signal.aborted) return;
      reportError(error);
    } finally {
      if (active === controller) active = undefined;
    }
  }

  function dispose(): void {
    active?.abort();
    active = undefined;
  }

  return { search, dispose };
}
```

Call `search(query)` when the input changes and `dispose()` when the view is removed. An aborted signal cannot be reused, so each search gets a fresh controller.

`signal` and a positive `timeout` are composed: either can abort the fetch. No timeout is set by default; `timeout: 0` disables an inherited timeout. A normal `abort()` produces an `AbortError`, while the library timeout uses `TimeoutError`. This example suppresses superseded/disposed requests but reports timeouts and other current-request failures.

An injected fetch must honor `init.signal` itself. Aborting does not guarantee that the server stopped processing the request.

Related: [test with injected fetch](../testing-injected-fetch/).
