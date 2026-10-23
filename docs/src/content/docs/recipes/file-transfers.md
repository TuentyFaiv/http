---
title: Upload and download files
description: Send multipart form data and download binary data with optional progress.
sidebar:
  order: 4
---

Use `FormData` for multipart uploads and an explicit `responseType` for downloads. These functions are intended for a browser app; the upload endpoint returns JSON `{ "id": "..." }`.

```ts
import { Http, rest } from "fetchzen";
import type { HttpProgressHandler } from "fetchzen";

const api = Http.create("https://api.example.com", {
  preset: rest,
  cache: false,
});

export async function uploadFile(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file, file.name);
  const { data } = await api.post<FormData, { id: string }>("/files", form, {
    signal,
  });
  return data;
}

export async function downloadFile(
  id: string,
  onProgress: HttpProgressHandler,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data } = await api.get<Blob>(`/files/${encodeURIComponent(id)}`, {
    responseType: "blob",
    onDownloadProgress: onProgress,
    signal,
  });
  return data;
}
```

Do **not** set a multipart `Content-Type` manually. The client passes `FormData` through and removes that header so fetch can generate the boundary. Raw `Blob`/`ArrayBuffer` uploads are also passed through, but do not automatically replace the client's default JSON content type; set an appropriate request `headers` value for those uploads.

## Progress and memory

`ReadableStream` request bodies are runtime-dependent. The client supplies
`duplex: "half"` when omitted and forwards it to native or custom Fetch; you may
also pass it explicitly. This does not enable streamed uploads in browsers that
do not support them. It provides neither upload progress nor resumable uploads.

- `onDownloadProgress` receives `{ loaded, total?, percent?, done }`. `loaded` counts bytes; `total` and `percent` depend on a usable `Content-Length`. Non-identity `Content-Encoding` leaves both undefined because compression can make the declared length differ from bytes read. A CORS response without a visible encoding header also has an unknown total; an uncompressed cross-origin server can send and expose `Content-Encoding: identity`. Handle missing totals with an indeterminate indicator.
- Native Fetch upload-transfer callbacks are **not** supported. Ordinary raw/multipart uploads remain indeterminate until their response. For server-confirmed progress, use [`uploadConfirmed`](../confirmed-uploads/) with a cooperating chunk endpoint; this is not transport progress or automatic file splitting for an ordinary endpoint.
- `responseType: "blob"` buffers the download. To use bytes instead, pair `get<ArrayBuffer>` with `responseType: "arrayBuffer"`.
- For large downloads, use `get<ReadableStream<Uint8Array> | null>` with `responseType: "stream"` and consume or cancel the returned stream. The request resolves before consumption finishes; handle read errors too. Progress follows consumption, not just the initial response.
- Binary and stream responses are not cloned by default. Use the returned `data`, rather than trying to read the response body again after a buffered download.
- Progress wrapping and cloning preserve `Response.url`, `redirected`, and `type`; they do not manufacture a known total for compressed responses.

To display a downloaded blob, create an object URL with `URL.createObjectURL(blob)` and revoke it with `URL.revokeObjectURL(url)` when it is no longer in use.

A forced binary response type applies to error responses too. `rest` still rejects failing HTTP statuses, but a JSON error body is not parsed as JSON when `responseType: "blob"` is selected.

Related: [cancelling stale requests](../cancelling-stale-requests/).
Try [file upload](../../examples/file-upload/), [download](../../examples/download/),
or [streaming](../../examples/streaming/).
