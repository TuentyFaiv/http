---
title: Tiempos de espera, reintentos y progreso
description: Cancela solicitudes, elige una política de reintentos y observa el progreso de descarga.
sidebar:
  order: 6
---

## Tiempos de espera y cancelación

Configura `timeout` en milisegundos en la instancia o solicitud. El valor de la
solicitud reemplaza al de la instancia; `timeout: 0` desactiva el tiempo de espera heredado.

```ts
import { Http } from "fetchzen";

const api = Http.create("https://api.example.com", { cache: false, timeout: 5_000 });
const controller = new AbortController();
const pending = api.safe.get("/slow", { timeout: 1_000, signal: controller.signal });

controller.abort();
const { error } = await pending;
console.log(error?.name);
```

La señal de tiempo de espera se combina con la tuya, así que cualquiera puede
cancelar Fetch. El temporizador se crea una vez para toda la solicitud, no para
cada reintento. El tiempo de espera usa `TimeoutError`; `controller.abort()` normalmente
usa `AbortError`. Llamar a `abort(reason)` puede producir un error distinto.
La cancelación también interrumpe la espera entre reintentos, incluido `Retry-After`,
sin iniciar otro intento.

:::caution[La cancelación es cooperativa]
Los transportes personalizados deben respetar `init.signal`. El cliente no interrumpe
los hooks, así que un timeout no es un límite estricto para todos los callbacks.
:::

## Reintentos

Los reintentos están **desactivados por defecto**. Con el cliente anterior:

```ts
await api.get("/users", { retry: 2 });
await api.get("/health", { retry: 0 });

await api.get("/report", {
	retry: { attempts: 3, delay: 250, statusCodes: [429, 503] },
});
```

`attempts` cuenta los reintentos después del primer envío: `2` permite hasta tres
envíos. `retry: 0` desactiva la política de reintentos de la instancia.

| Opción | Valor predeterminado |
| --- | --- |
| `methods` | `GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS` |
| `statusCodes` | `408`, `429`, `500`, `502`, `503`, `504` |
| `delay` | Espera exponencial desde 300 ms, con base limitada a 10 segundos y variación aleatoria de 0–99 ms. |
| `respectRetryAfter` | `true` |

`delay` también acepta `(attempt, response) => milliseconds`; los intentos empiezan
en cero y `response` está ausente tras un error de transporte. Un `Retry-After`
válido (segundos o fecha HTTP) tiene prioridad sobre el retardo y no está limitado
por el máximo de la espera predeterminada.

Los reintentos se aplican a los métodos permitidos y a los estados HTTP configurados
o errores de transporte. Una señal cancelada detiene los reintentos sin importar
su motivo. Los errores llamados `AbortError` y `TimeoutError` tampoco se reintentan.
Los errores de un callback `delay` personalizado se propagan sin reintentar.
Los errores de lectura, preset y esquema ocurren después del envío y no se reintentan.
Antes de reintentar una respuesta HTTP, el cliente cancela su cuerpo descartado;
la respuesta final sigue disponible para el procesamiento normal.

:::caution[Seguridad al repetir solicitudes]
POST/PATCH se excluyen por defecto. Agrégalos a `methods` solo si el contrato de
idempotencia del servidor permite repetirlos con seguridad. Las solicitudes con un
cuerpo `ReadableStream` nunca se reintentan automáticamente, incluso con una política
explícita: el cliente no puede rebobinarlas. Su primera respuesta o error de transporte
sigue el manejo normal. Los hooks de solicitud se ejecutan una sola vez,
por lo que cada reintento reutiliza el cuerpo, los encabezados y la URL preparados.
:::

## Progreso de descarga

```ts
import { Http } from "fetchzen";

const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get<Blob>("/export.zip", {
	responseType: "blob",
	onDownloadProgress: ({ loaded, total, percent, done }) => {
		console.log({ loaded, total, percent, done });
	},
});
console.log(payload.size);
```

`loaded` indica los bytes leídos. `total` y `percent` (0–100) están disponibles cuando
un `Content-Length` utilizable describe los bytes que se leen. Un `Content-Encoding`
distinto de identity deja el total/porcentaje desconocido porque la longitud declarada
puede describir bytes comprimidos. En una respuesta de otro origen con `type: "cors"`,
el encabezado de codificación ausente puede estar oculto por CORS, por lo que el cliente
también deja el total desconocido. Un servidor que envía bytes sin comprimir puede
enviar `Content-Encoding: identity` y exponerlo con
`Access-Control-Expose-Headers: Content-Encoding` para habilitar un total conocido.
De lo contrario, muestra un indicador indeterminado. `done` marca el fin del consumo
del stream, no el éxito de una validación posterior.

El progreso depende del consumo del cuerpo. Los modos JSON, text, blob y arrayBuffer
lo consumen automáticamente. Con `responseType: "stream"`, debes consumir el stream
devuelto; con `none`, el cliente no lee el cuerpo. El progreso describe la respuesta
final, no todo el tráfico de reintentos. Fetch nativo no tiene callbacks de
transferencia de carga. Para progreso confirmado por el servidor, usa
[`uploadConfirmed`](../../recipes/confirmed-uploads/) con un endpoint de
fragmentos compatible. Las cargas directas y multipart siguen indeterminadas.

Consulta [solicitudes y respuestas](../requests-responses/) para las opciones de lectura y clonación.
Prueba [tiempo límite y cancelación](../../examples/timeout-cancellation/),
[reintentos](../../examples/retries/) o [progreso de descarga](../../examples/download/).
