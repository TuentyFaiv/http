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
import { bare, Http, rest } from "fetchzen";

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
cliente y otro preset lanza un error en lugar de cambiar la forma del resultado.

### Las consultas compartidas conservan el preset

El primer preset de un cliente queda fijo durante toda su vida. Al consultar un
cliente compartido con la misma cadena exacta de URL base, el preset explícito debe
ser el objeto original; otro objeto lanza un error aunque su `shape` sea idéntico.

Omitir `preset` afirma la forma predeterminada `envelope`. Recuperar un cliente
con otra forma sin su preset original lanza un error en lugar de prometer una
forma de retorno incorrecta en TypeScript:

```ts
const shared = Http.create("https://api.example.com/rest", { preset: rest });
const same = Http.create("https://api.example.com/rest", { preset: rest });
console.log(same === shared); // true
// Http.create("https://api.example.com/rest"); // lanza un error: no es envelope
```

Prefiere exportar la instancia tipada para reutilizarla. Para presets personalizados,
conserva y reutiliza el objeto original: cada llamada a `extend()` crea otro objeto,
así que repetir las mismas opciones de extensión no es una consulta compatible.
[`configure`](../../recipes/shared-typed-client/#actualiza-los-valores-para-futuras-solicitudes)
actualiza valores de solicitud, no presets; usa `cache: false` para otro cliente.

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

Su `message` proviene de la API cuando está disponible; de otro modo suele estar vacío.
`success` se calcula según el preset, no es un alias de `response.ok`: un arreglo
JSON vacío puede producir `false` con HTTP 200 sin rechazar la solicitud.
El `response` devuelto es un `Response` de Fetch; los cuerpos JSON/texto se clonan
por defecto para poder leerlos de nuevo. Consulta [procesamiento de respuestas](../requests-responses/).

## Extiende un preset

`extend` crea un preset sin modificar el original. Cambia las claves de `unwrap`
o reemplaza la lista de convenciones; incluye la lista anterior con spread para
conservar sus comprobaciones.

```ts
import { envelope, Http, toErrorInit } from "fetchzen";
import type { ConventionMatcher } from "fetchzen";

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
import { createPreset, Http, statusFallback } from "fetchzen";
import type { ApplyShape, ResponseContext, Unwrap } from "fetchzen";

declare module "fetchzen" {
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
