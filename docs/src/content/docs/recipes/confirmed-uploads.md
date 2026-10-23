---
title: Server-confirmed uploads
description: Track sequential Blob chunks using exact server byte receipts.
sidebar:
  order: 5
---

Browser Fetch has no native upload-transfer callbacks. `uploadConfirmed` is an
opt-in convention: send one chunk, wait for its server receipt, then send the
next. It measures **server-confirmed bytes**, not bytes handed to Fetch.
This changes your server API; it cannot transparently split a file sent to an
ordinary whole-file endpoint.

## Reuse your shared client

Keep the application's existing shared `Http` client, credentials, hooks and
response preset. No particular preset is required. This example assumes the
default envelope response `{ data: { receivedBytes: number } }` and its `.payload`:

```ts
import { ContentType, type HttpClient } from "fetchzen";
import { uploadConfirmed, type HttpUploadChunkReceipt } from "fetchzen/helpers";

export function uploadFile(api: HttpClient, file: File, signal?: AbortSignal) {
  return uploadConfirmed(file, {
    signal,
    sendChunk: async (chunk, { offset, total, signal }) => {
      const result = await api.post<Blob, HttpUploadChunkReceipt>("upload-chunk", chunk, {
        type: ContentType.APPLICATION_OCTET_STREAM,
        headers: { "X-Upload-Offset": String(offset), "X-Upload-Total": String(total) },
        signal,
        retry: 0,
      });
      return result.payload;
    },
    onUploadProgress: ({ loaded, total, percent, done }) => {
      console.log({ loaded, total, percent, done });
    },
  });
}
```

Adapt the route, session identifier, headers and receipt extraction to your API.
Use `retry: 0` unless the server implements offset/session deduplication: a lost
response can hide a successfully received chunk. The sender owns routes,
credentials, idempotency and retry policy, and must pass `signal` to the network
request for cancellation. Cancellation cannot roll back already confirmed bytes.

## Contract

`uploadConfirmed` is exported from `/helpers` and the package root:

```ts
declare function uploadConfirmed(body: Blob, options: {
  chunkSize?: number, // default: 256 KiB
  signal?: AbortSignal,
  sendChunk: (
    chunk: Blob,
    context: { offset: number; total: number; signal?: AbortSignal },
  ) => Promise<{ receivedBytes: number }> | { receivedBytes: number },
  onUploadProgress?: (progress: {
    loaded: number; total: number; percent: number; done: boolean;
  }) => void,
}): Promise<{ receivedBytes: number; total: number; chunks: number }>;
```

- The body is a `Blob` (including `File`); `total` comes from `Blob.size`.
  Multipart, JSON and request streams are not chunked by this helper.
- The initial event is `0%`, `done: false`. Progress advances only after an
  exact receipt: `receivedBytes === chunk.size`. Partial, oversized or malformed
  receipts fail without crediting that chunk.
- An empty body still sends one zero-byte request. Only a receipt of `0` produces
  the final `100%` event.
- The last `done: true` means all byte receipts arrived. It does **not** mean the
  file was assembled, stored, accepted or processed. Receipts trust the server;
  they are not cryptographic proof.

Sequential HTTP round trips trade throughput for simple, acknowledged progress.
Smaller chunks give more frequent updates but more requests; larger chunks give
fewer updates. Choose a size within your endpoint's limit. The helper remains
Fetch-only with zero runtime dependencies: no XHR, polling, state store,
localStorage or sessionStorage, and no automatic persistence or resume.

## Demo versus production

Try the [confirmed-upload example](../../examples/confirmed-upload/). The public
demo reads each actual raw body (at most 256 KiB), then returns
`{ data: { receivedBytes: number, stored: false } }`. It is stateless: it counts
and discards bytes, never assembles files. Use synthetic data, not private files;
requests pass through Cloudflare even though the application does not store them.

A production service needs authenticated upload sessions, ordered offsets and
idempotency, size limits and quotas, explicit finalization, and cleanup of
incomplete uploads. Model finalization separately from byte progress.
Ordinary [raw and multipart uploads](../file-transfers/) still have no native
browser transport callback; keep their waiting indicators indeterminate.
