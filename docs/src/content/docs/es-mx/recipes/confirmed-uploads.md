---
title: Cargas confirmadas por el servidor
description: Mide fragmentos secuenciales de Blob con recibos exactos de bytes.
sidebar:
  order: 5
---

Fetch del navegador no tiene callbacks nativos de transferencia de carga.
`uploadConfirmed` es una convención opcional: envía un fragmento, espera su
recibo del servidor y después envía el siguiente. Mide **bytes confirmados por
el servidor**, no bytes entregados a Fetch. Cambia la API del servidor; no divide
de forma transparente una carga dirigida a un endpoint de archivos completos.

## Reutiliza tu cliente compartido

Conserva el cliente `Http` compartido de tu aplicación, sus credenciales, hooks
y preset. No requiere un preset específico. Este ejemplo usa el envelope
predeterminado `{ data: { receivedBytes: number } }` y su `.payload`:

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

Adapta la ruta, el identificador de sesión, los encabezados y la extracción del
recibo a tu API. Usa `retry: 0` salvo que el servidor implemente deduplicación por
offset y sesión: perder una respuesta puede ocultar un fragmento ya recibido.
El callback controla rutas, credenciales, idempotencia y reintentos. Debe pasar
`signal` a la solicitud de red para cancelarla. Cancelar no revierte bytes ya
confirmados.

## Contrato

`uploadConfirmed` se exporta desde `/helpers` y la raíz del paquete:

```ts
declare function uploadConfirmed(body: Blob, options: {
  chunkSize?: number, // predeterminado: 256 KiB
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

- El cuerpo es un `Blob` (incluye `File`); `total` viene de `Blob.size`.
  El helper no divide multipart, JSON ni streams de solicitud.
- El evento inicial es `0%`, `done: false`. Solo avanza con un recibo exacto:
  `receivedBytes === chunk.size`. Recibos parciales, excesivos o malformados
  causan un error sin acreditar ese fragmento.
- Un cuerpo vacío envía una solicitud de cero bytes. Solo el recibo de `0`
  produce el evento final de `100%`.
- El último `done: true` indica que llegaron todos los recibos de bytes, **no**
  que el archivo fue ensamblado, almacenado, aceptado o procesado. Se confía en el
  servidor; el recibo no es una prueba criptográfica.

Las solicitudes HTTP secuenciales sacrifican rendimiento por progreso confirmado
simple. Fragmentos pequeños dan actualizaciones frecuentes con más solicitudes;
los grandes dan menos actualizaciones. Elige un tamaño dentro del límite del
endpoint. El helper usa solo Fetch, sin dependencias de runtime: no agrega XHR,
polling, almacén de estado, localStorage ni sessionStorage, ni persistencia o
reanudación automática.

## Demo y producción

Prueba el [ejemplo de carga confirmada](../../examples/confirmed-upload/).
El demo público lee el cuerpo binario real (máximo 256 KiB) antes de responder
`{ data: { receivedBytes: number, stored: false } }`. No tiene estado: cuenta y
descarta bytes, nunca ensambla archivos. Usa datos sintéticos, no archivos privados;
las solicitudes pasan por Cloudflare aunque la aplicación no las almacene.

En producción necesitas sesiones de carga autenticadas, offsets ordenados e
idempotencia, límites de tamaño y cuotas, finalización explícita y limpieza de
cargas incompletas. Separa la finalización del progreso de bytes.
Las [cargas directas y multipart](../file-transfers/) siguen sin callbacks nativos
de transferencia del navegador; muestra una espera indeterminada.
