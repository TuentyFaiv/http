---
title: Errores
description: Inspecciona errores del servicio, conserva los errores nativos y usa tuplas de resultado.
sidebar:
  order: 4
---

Los errores HTTP/de API reconocidos por un preset, el JSON inválido y los errores
de esquema usan `ServiceError`. Los errores de red, la cancelación y tus propios
objetos `Error` no se convierten en `ServiceError`.

## Maneja una solicitud rechazada

```ts
import { Http, ServiceError } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });

try {
	await api.get("/users/1");
} catch (error) {
	if (error instanceof ServiceError) {
		console.error(error.status, error.message, error.errors);
	} else if (error instanceof Error && error.name === "AbortError") {
		console.info("Solicitud cancelada");
	} else {
		throw error;
	}
}
```

| Propiedad | Significado |
| --- | --- |
| `message`, `status`, `statusText` | Detalles elegidos por el preset; los campos de la API pueden reemplazar el estado HTTP. |
| `errors` | Una cadena, un arreglo de cadenas o un objeto con `description` opcional. |
| `code` | Código opcional para procesamiento automático; no todos los códigos de la API se copian aquí. |
| `response` | `Response` de Fetch opcional; usa `response.status` para conocer el estado HTTP real. |
| `request` | `{ url, method }` opcional; se incluye en los errores normales del preset y del esquema. |
| `cause` | Error original cuando está disponible, como un `SyntaxError` al procesar JSON. |

`toJSON()` incluye campos de diagnóstico y metadatos de la solicitud, pero omite
`response` y `cause`. Revisa los mensajes, las URLs y los detalles del error antes
de enviarlos a un servicio de registros.

Las instancias de `Error` existentes conservan su identidad, stack y causa, salvo
que un hook de error las reemplace. Los valores lanzados que no sean `Error` se
 envuelven en uno con el valor original como `cause`.

## Usa una tupla de error y resultado

Cada método HTTP tiene una versión `safe` con los mismos argumentos y la misma
estructura del preset:

```ts
import { Http, ServiceError } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });
const [error, result] = await api.safe.get<{ id: number }>("/me");

if (error) {
	console.error(error.message);
	if (error instanceof ServiceError) {
		console.error(error.status, error.errors);
	}
} else {
	console.log(result.payload.id);
}
```

La tupla es `[Error, undefined]` o `[undefined, result]`. Verifica el tipo del error
antes de acceder a propiedades exclusivas de `ServiceError`. `safe` no desactiva
la validación ni los hooks de error. Solo envuelve los métodos HTTP: **`api.safe.request()`
no devuelve una tupla segura**; usa uno de los métodos HTTP o captura el error de
`api.request()` por tu cuenta.

## Códigos reservados

| Código | Significado |
| --- | --- |
| `ERR_INVALID_JSON` | Falló la lectura de JSON. `errors.description` contiene hasta los primeros 200 caracteres; `cause` es el error de lectura. |
| `ERR_SCHEMA` | La validación del esquema devolvió problemas, convertidos en mensajes dentro de `errors`. |

El cuerpo se procesa antes de la validación del preset. Por eso, un JSON inválido
en una respuesta 500 puede producir `ERR_INVALID_JSON` en lugar del error HTTP del preset.
Un tiempo de espera agotado normalmente tiene el nombre `TimeoutError`; la
cancelación predeterminada usa `AbortError`. Quien cancela puede proporcionar otro
motivo. Consulta [tiempos de espera y reintentos](../resilience/).

## Reemplaza la validación de una solicitud

Un `thrower` síncrono **reemplaza** la validación del preset, incluida la comprobación
del estado HTTP. Delega a `presetThrower` para conservar las comprobaciones habituales:

```ts
import { envelope, Http, presetThrower, ServiceError } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", { cache: false });
const fallback = presetThrower(envelope);

await api.get("/legacy", {
	thrower: ({ json, response }) => {
		if (json.legacyError) {
			throw new ServiceError({
				message: "Error de la API heredada",
				status: response.status,
				statusText: response.statusText,
				errors: [],
				response,
			});
		}
		fallback({ json, response });
	},
});
```

Usa el preset real del cliente al construir el fallback. Para respuestas que no
son JSON, `json` es un objeto vacío. La validación del esquema sigue después del
thrower. Para reglas reutilizables, prefiere las [convenciones de presets](../presets/).
