---
title: Presets
description: Elige la estructura del resultado y las convenciones de la API que rechazan una respuesta.
sidebar:
  order: 2
---

Un preset valida la respuesta procesada y construye el valor devuelto. Cambiarlo
modifica el comportamiento en ejecución y los tipos de retorno de TypeScript,
no la forma en que Fetch envía la solicitud.

## Elige un preset

| Preset | Devuelve | Rechaza cuando |
| --- | --- | --- |
| `envelope` (predeterminado) | `{ success, message, payload, response }` | Coincide una convención de error de la API o el estado HTTP está fuera de 2xx. |
| `bare` | El cuerpo procesado | El estado HTTP está fuera de 2xx. |
| `rest` | `{ data, status, headers, response }` | El estado HTTP está fuera de 2xx. |
| `problem` | El cuerpo procesado | El estado HTTP está fuera de 2xx; lee los detalles RFC 9457 cuando están disponibles. |

Solo `envelope` extrae `data` o `payload` por defecto. En `bare`, `rest` y `problem`,
el tipo del payload debe describir todo el cuerpo procesado.

```ts
import { bare, Http, rest } from "@tuentyfaiv/http";

type User = { id: number; name: string };

const api = Http.create("https://api.example.com", { cache: false });
const wrapped = await api.get<User>("/me");
console.log(wrapped.payload.name);

const raw = Http.create("https://api.example.com", { cache: false, preset: bare });
const user = await raw.get<User>("/me");
console.log(user.name);

const restful = Http.create("https://api.example.com", { cache: false, preset: rest });
const result = await restful.get<User>("/me");
console.log(result.data.name, result.status, result.headers.get("ETag"));
```

Usa `cache: false` aquí: de lo contrario, la misma URL base reutiliza el primer
cliente e ignora los presets seleccionados después.

## Convenciones de envelope

Los matchers se ejecutan en orden; la primera coincidencia rechaza la respuesta,
incluso con HTTP 200:

1. `errorField()`: `error` truthy con `result` falsy o ausente.
2. `detailField()`: `detail` truthy cuyo `success` es falsy o está ausente.
3. `payloadField()`: `payload` truthy con `success` de nivel superior falsy o ausente.
4. `errorsField()`: `errors` truthy (incluidos arreglos y objetos vacíos).
5. `statusFallback()`: estado HTTP fuera de 2xx.

Estas comprobaciones usan valores truthy/falsy, no estrictamente `success === false`.
Por ejemplo, `{ payload: { id: 1 } }` se rechaza si no tiene un `success` truthy.
Usa otro preset o personaliza las convenciones si no coinciden con tu API.

`envelope` busca `data` y luego `payload`, y toma el primer valor distinto de
null/undefined. No extrae campos de forma recursiva. Si ninguno existe, conserva el cuerpo.

## Extiende un preset

`extend` crea un preset sin modificar el original. Cambia las claves de `unwrap`
o reemplaza la lista de convenciones; incluye la lista anterior con spread para
conservar sus comprobaciones.

```ts
import { envelope, Http, toErrorInit } from "@tuentyfaiv/http";
import type { ConventionMatcher } from "@tuentyfaiv/http";

const rejectWarnings: ConventionMatcher = (context, json) =>
	json.warning ? toErrorInit(context, { message: "Advertencia de la API", errors: [] }) : undefined;

const strict = envelope.extend({
	name: "strict",
	unwrap: ["result"],
	conventions: [rejectWarnings, ...envelope.conventions],
});

const api = Http.create("https://api.example.com", { cache: false, preset: strict });
await api.get<{ id: number }>("/me");
```

## Crea una estructura de resultado

Registra la estructura mediante declaration merging y proporciona una función
`build` tipada. Conserva `statusFallback()` salvo que quieras aceptar estados HTTP de error.

```ts
import { createPreset, Http, statusFallback } from "@tuentyfaiv/http";
import type { ApplyShape, ResponseContext, Unwrap } from "@tuentyfaiv/http";

declare module "@tuentyfaiv/http" {
	interface HttpShapes<T> {
		traced: { data: T; traceId: string | null };
	}
}

const traced = createPreset({
	name: "traced",
	shape: "traced",
	conventions: [statusFallback()],
	unwrap: ["result"],
	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"traced", T> {
		return {
			data: unwrap(context.body) as T,
			traceId: context.response.headers.get("X-Trace-Id"),
		};
	},
});

const api = Http.create("https://api.example.com", { cache: false, preset: traced });
const result = await api.get<{ id: number }>("/me");
console.log(result.data.id, result.traceId);
```

Usa el callback `unwrap` recibido por `build` para que la
[validación con esquemas](../validation/) pueda proporcionar un payload transformado.
Para reemplazar la validación de una sola solicitud, consulta [`thrower`](../errors/).
