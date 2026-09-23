---
title: Validación
description: Valida los datos extraídos de una respuesta con un validador Standard Schema.
sidebar:
  order: 5
---

Un genérico de TypeScript describe los datos esperados, pero no comprueba la respuesta
del servidor. Pasa un validador [Standard Schema v1](https://standardschema.dev) como
`schema` para validar en ejecución. Las versiones compatibles de Zod, Valibot y
ArkType pueden proporcionarlo; instala el validador por separado. El cliente HTTP
no agrega dependencias de validación.

## Valida un payload

Este esquema completo y sin dependencias muestra el contrato. En una aplicación,
puedes reemplazarlo por un esquema de tu validador preferido.

```ts
import { Http, ServiceError } from "@tuentyfaiv/http";
import type { InferSchemaOutput, StandardSchemaV1 } from "@tuentyfaiv/http";

const userSchema: StandardSchemaV1<unknown, { id: number; name: string }> = {
	"~standard": {
		version: 1,
		vendor: "app",
		validate(value) {
			if (
				typeof value === "object" &&
				value !== null &&
				"id" in value &&
				typeof value.id === "number" &&
				"name" in value &&
				typeof value.name === "string"
			) {
				return { value: { id: value.id, name: value.name.trim() } };
			}
			return { issues: [{ message: "Se esperaba un usuario con id numérico y nombre" }] };
		},
	},
};

type User = InferSchemaOutput<typeof userSchema>;
const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get<User>("/me", { schema: userSchema });
console.log(payload.name);
```

Actualmente, el método **no** infiere el genérico del resultado a partir de `schema`.
Indica `User` (o el tipo de salida de tu validador) explícitamente. Si hay una
transformación, el genérico debe usar su tipo de salida, no el de entrada.

## Qué se valida

Con el preset predeterminado `envelope`, esta respuesta:

```json
{ "data": { "id": 7, "name": " Ada " } }
```

pasa `{ id: 7, name: " Ada " }` al esquema. El ejemplo anterior devuelve
`{ id: 7, name: "Ada" }` como `payload`.

La validación usa las claves `unwrap` del preset. `bare` y `rest` no extraen campos
por defecto, así que sus esquemas reciben todo el cuerpo procesado. Se admiten
validadores asíncronos. Para payloads JSON, la salida del esquema reemplaza el valor
extraído, lo que permite transformaciones, coerciones y valores predeterminados de tu validador.

:::note[Alcance actual]
Esto valida datos de respuesta, no cuerpos de solicitud. El preset envelope
predeterminado construye los resultados de texto, binarios y streams directamente
del cuerpo procesado, por lo que las transformaciones del esquema no se aplican a
esos payloads devueltos. Prefiere este flujo para JSON; los presets personalizados
deben usar el callback `unwrap` que reciben.
:::

## Maneja errores de validación

Continúa con el cliente y el esquema anteriores:

```ts
const [error, result] = await api.safe.get<User>("/me", { schema: userSchema });

if (error instanceof ServiceError && error.code === "ERR_SCHEMA") {
	console.error(error.errors);
} else if (error) {
	console.error(error.message);
} else {
	console.log(result.payload.name);
}
```

Los problemas devueltos se convierten en un `ServiceError` con `code: "ERR_SCHEMA"`;
las rutas y los mensajes se aplanan en cadenas dentro de `errors`. Si el propio
validador lanza una excepción, el error sigue la ruta normal en vez de convertirse en `ERR_SCHEMA`.

El flujo es **lectura → validación del preset (o thrower) → esquema → resultado**.
Una respuesta HTTP 500 que se procesa correctamente falla antes del esquema. Un
JSON inválido falla incluso antes. Un `thrower` personalizado puede cambiar qué
respuestas HTTP llegan al esquema. Consulta [errores](../errors/) y [presets personalizados](../presets/).
