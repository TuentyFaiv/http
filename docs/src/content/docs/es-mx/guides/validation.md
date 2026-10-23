---
title: Validación
description: Valida respuestas con Zod o Valibot e infiere su tipo de TypeScript.
sidebar:
  order: 5
---

Un genérico de TypeScript describe los datos esperados, pero no comprueba la respuesta
del servidor. Pasa un esquema de Zod o Valibot para validar la respuesta e inferir su tipo.
Ambos admiten [Standard Schema v1](https://standardschema.dev), así que no necesitas un adaptador.
Instala el validador elegido en tu app; el cliente HTTP no agrega dependencias de validación.

## Con Zod

Instala Zod 4:

```sh
bun add zod@4
```

```ts
import { Http } from "fetchzen";
import { z } from "zod";

const userSchema = z.object({
	id: z.number(),
	name: z.string().trim(),
});

const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get("/me", { schema: userSchema });
console.log(payload.name); // Se infiere como string; se quitan espacios en los extremos.
```

## Con Valibot

Instala Valibot 1:

```sh
bun add valibot@1
```

```ts
import { Http } from "fetchzen";
import * as v from "valibot";

const userSchema = v.object({
	id: v.number(),
	name: v.pipe(v.string(), v.trim()),
});

const api = Http.create("https://api.example.com", { cache: false });
const { payload } = await api.get("/me", { schema: userSchema });
console.log(payload.name); // Se infiere como string; se quitan espacios en los extremos.
```

## Tipos inferidos

El resultado se infiere de la **salida** del esquema, incluidas sus transformaciones,
no de su entrada. Omite los genéricos para usar esta inferencia; el cuerpo de la
solicitud también se infiere de su argumento. Los métodos normales, seguros y
`request()` siguen la misma regla. Usa `InferSchemaOutput<typeof userSchema>` si
necesitas nombrar el tipo de salida. Sin un esquema garantizado o un modo de respuesta
explícito, el payload inferido sigue siendo `unknown`; las opciones de esquema
opcionales o con tipos amplios no establecen un tipo validado.

## Qué se valida

Con el preset predeterminado `envelope`, esta respuesta:

```json
{ "data": { "id": 7, "name": " Ada " } }
```

pasa `{ id: 7, name: " Ada " }` al esquema. Ambos ejemplos devuelven
`{ id: 7, name: "Ada" }` como `payload`.

La validación usa las claves `unwrap` del preset. `bare` y `rest` no extraen campos
por defecto, así que sus esquemas reciben todo el cuerpo procesado. Se admiten
validadores asíncronos. La salida del esquema reemplaza el payload en todos los modos
de respuesta, lo que permite transformaciones, coerciones y valores predeterminados.
Las salidas `undefined`, `null`, `false`, `0` o `""` se conservan en lugar de sustituirse
por el cuerpo original.

:::note[Alcance actual]
Esto valida datos de respuesta, no cuerpos de solicitud. La lectura ocurre primero:
por ejemplo, `responseType: "text"` entrega una cadena al validador. Un esquema
determina el tipo final del payload en lugar del modo de respuesta original.
Los presets personalizados deben usar el callback `unwrap` que reciben para
conservar la salida validada.
:::

## Maneja errores de validación

Continúa con el cliente y el esquema de cualquiera de los ejemplos:

```ts
import { ServiceError } from "fetchzen";

const { data: result, error } = await api.safe.get("/me", { schema: userSchema });

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
Prueba [validación](../../examples/validation/) y [transformaciones](../../examples/transforms/).
