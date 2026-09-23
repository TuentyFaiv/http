---
title: Hooks
description: Observa o reemplaza solicitudes, respuestas y errores, y configura los registros.
sidebar:
  order: 3
---

Los hooks se registran en un cliente, se ejecutan en orden de registro y pueden
ser síncronos o asíncronos. No son opciones de configuración por solicitud.

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", {
	cache: false,
	hooks: {
		request: [
			({ url, init }) => {
				init.headers.set("X-Request-Id", crypto.randomUUID());
				return { url, init };
			},
		],
		response: [
			(response) => {
				console.info("Estado HTTP", response.status);
			},
		],
		error: [
			(error) => {
				console.error(error.message);
			},
		],
	},
});

await api.get("/users");
```

## Contratos de los hooks

| Hook | Recibe | Valor devuelto |
| --- | --- | --- |
| `request` | `{ url, init }`, después de preparar encabezados, cuerpo y URL | Un contexto reemplaza URL/init; un `Response` omite la red y los hooks de solicitud restantes. |
| `response` | `(response, context)`, antes de procesar el cuerpo y validar el preset | Un `Response` reemplaza la respuesta que usarán los siguientes hooks y el procesamiento. |
| `error` | `(error, context)` | Un `Error` reemplaza el error que recibe quien hizo la llamada. |

No devolver nada conserva el contexto, la respuesta o el error actual. Los hooks
de error no recuperan un resultado exitoso: la solicitud sigue rechazándose (o
regresa el error en la tupla de `safe`). Los hooks de solicitud se ejecutan una vez,
no en cada reintento. Los de respuesta ven la respuesta final, no las intermedias de los reintentos.

:::caution[No consumas la respuesta al observarla]
Lee `response.clone()` si un hook necesita el cuerpo. Leer el original lo consume
antes de que el cliente pueda procesarlo. Clonar cuerpos grandes puede aumentar el uso de memoria.
:::

## Registra y elimina un hook

Con el cliente anterior, `hook()` devuelve una función para cancelar el registro.
Elimina los hooks temporales cuando ya no se necesiten para evitar duplicados en
clientes de larga duración.

```ts
const off = api.hook("request", ({ init }) => {
	init.headers.set("X-Feature", "preview");
});

await api.get("/users");
off();
```

## Devuelve una respuesta local

Un hook de solicitud puede devolver un `Response` normal de Fetch. Los hooks de
respuesta, la lectura del cuerpo y las validaciones del preset y del esquema siguen ejecutándose:

```ts
const offLocal = api.hook("request", ({ url }) => {
	if (new URL(url).pathname === "/health") {
		return Response.json({ data: { healthy: true } });
	}
});

await api.get("/health");
offLocal();
```

Crea una respuesta nueva o clona una almacenada para cada solicitud; no puedes
reutilizar una respuesta consumida. Esto reemplaza el transporte, no es una caché de respuestas integrada.

## Registros

Los registros son independientes de los hooks y están desactivados por defecto.
Actívalos con `log: true` en la instancia o solicitud. Configura un logger propio en la instancia:

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com", {
	cache: false,
	log: true,
	logger: {
		request: ({ init }) => console.debug(init.method),
		response: ({ response, duration }) => console.debug(response.status, duration),
		error: ({ error }) => console.error(error.name),
	},
});

await api.get("/health");
```

`duration` mide milisegundos hasta terminar de procesar el cuerpo, no solo la latencia
de red. El registro de respuesta ocurre antes de validar el preset/esquema, así que
puede ir seguido de un registro de error.

El logger integrado oculta los encabezados `authorization`, `proxy-authorization`,
`cookie`, `set-cookie`, `x-api-key` y `x-auth-token`. **No oculta las URLs, los cuerpos
ni los detalles de los errores.** Los loggers personalizados reciben datos sin
ocultar; usa `redactHeaders` al registrar encabezados y aplica tus propias reglas al resto.

Consulta [errores](../errors/) para conocer su identidad y
[reintentos](../resilience/) para revisar su comportamiento.
