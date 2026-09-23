---
title: Sube y descarga archivos
description: Envía formularios multipart y descarga datos binarios con progreso opcional.
sidebar:
  order: 4
---

Usa `FormData` para cargas multipart y un `responseType` explícito para las descargas. Estas funciones están pensadas para una aplicación en el navegador; el endpoint de carga devuelve JSON `{ "id": "..." }`.

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

**No** establezcas a mano el `Content-Type` de multipart. El cliente pasa `FormData` sin modificarlo y elimina ese encabezado para que fetch genere el separador de las partes. Las cargas directas de `Blob`/`ArrayBuffer` también se pasan sin modificar, pero no reemplazan automáticamente el tipo de contenido JSON predeterminado del cliente; indica el valor adecuado en `headers` para esas cargas.

## Progreso y memoria

- `onDownloadProgress` recibe `{ loaded, total?, percent?, done }`. `loaded` cuenta bytes; `total` y `percent` dependen de un `Content-Length` utilizable. Si no hay total, muestra un indicador indeterminado. La compresión puede hacer que la longitud declarada difiera de los bytes leídos.
- El progreso de carga **no** está disponible. La promesa de carga se resuelve después de leer y validar la respuesta, no como un evento de progreso de subida.
- `responseType: "blob"` guarda toda la descarga en memoria. Si necesitas bytes, combina `get<ArrayBuffer>` con `responseType: "arrayBuffer"`.
- Para descargas grandes, usa `get<ReadableStream<Uint8Array> | null>` con `responseType: "stream"` y consume o cancela el stream devuelto. La petición se resuelve antes de terminar la lectura; también debes manejar los errores de lectura. El progreso avanza al consumir el stream, no solo al recibir la respuesta inicial.
- Las respuestas binarias y de tipo stream no se clonan de forma predeterminada. Usa el `data` devuelto en lugar de intentar leer otra vez el cuerpo de la respuesta después de una descarga almacenada en memoria.

Para mostrar un blob descargado, crea una URL de objeto con `URL.createObjectURL(blob)` y libérala con `URL.revokeObjectURL(url)` cuando dejes de usarla.

Forzar un tipo de respuesta binario también afecta las respuestas de error. `rest` sigue rechazando los estados HTTP de fallo, pero un cuerpo de error JSON no se interpreta como JSON si seleccionas `responseType: "blob"`.

Consulta también: [cancelación de peticiones obsoletas](../cancelling-stale-requests/).
