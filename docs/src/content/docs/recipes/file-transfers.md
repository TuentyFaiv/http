---
title: Upload and download files
description: Send multipart form data and download binary data with optional progress.
sidebar:
  order: 4
---

Use `FormData` for multipart uploads and an explicit `responseType` for downloads. These functions are intended for a browser app; the upload endpoint returns JSON `{ "id": "..." }`.

```ts
import { Http, rest } from "@tuentyfaiv/http";
import type { HttpProgressHandler } from "@tuentyfaiv/http";

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

- `onDownloadProgress` receives `{ loaded, total?, percent?, done }`. `loaded` counts bytes; `total` and `percent` depend on a usable `Content-Length`. Handle missing totals with an indeterminate indicator. Compression can make the declared length differ from the bytes read.
- Upload progress is **not** supported. The upload's promise resolves after its response has been read and validated, not as an upload-progress event.
- `responseType: "blob"` buffers the download. To use bytes instead, pair `get<ArrayBuffer>` with `responseType: "arrayBuffer"`.
- For large downloads, use `get<ReadableStream<Uint8Array> | null>` with `responseType: "stream"` and consume or cancel the returned stream. The request resolves before consumption finishes; handle read errors too. Progress follows consumption, not just the initial response.
- Binary and stream responses are not cloned by default. Use the returned `data`, rather than trying to read the response body again after a buffered download.

To display a downloaded blob, create an object URL with `URL.createObjectURL(blob)` and revoke it with `URL.revokeObjectURL(url)` when it is no longer in use.

A forced binary response type applies to error responses too. `rest` still rejects failing HTTP statuses, but a JSON error body is not parsed as JSON when `responseType: "blob"` is selected.

Related: [cancelling stale requests](../cancelling-stale-requests/).
