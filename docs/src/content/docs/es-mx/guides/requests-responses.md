---
title: Solicitudes y respuestas
description: Envía parámetros, JSON, formularios y encabezados, y elige cómo leer la respuesta.
sidebar:
  order: 1
---

## Métodos y tipos

`get` y `head` reciben la configuración como segundo argumento. `post`, `put`,
`patch`, `delete` y `options` reciben un cuerpo opcional como segundo argumento y
la configuración como tercero. Los siguientes fragmentos comparten este cliente y estos tipos:

```ts
import { ContentType, Http } from "@tuentyfaiv/http";

type User = { id: number; name: string };
type CreateUser = { name: string };
const api = Http.create("https://api.example.com/v1", { cache: false });

await api.get<User>("/users/1");
await api.post<CreateUser, User>("/users", { name: "Ada" });
await api.delete<undefined, undefined>("/users/1", undefined, { timeout: 2_000 });
```

En GET/HEAD, los genéricos son `<Result, Params>`; en los demás métodos y en `request`,
son `<Body, Result, Params>`. El tipo del resultado describe el payload dentro del
[preset](../presets/), no el objeto completo que se devuelve. No valida los datos en ejecución.

Puedes hacer la misma llamada con el método explícito:

```ts
await api.request<CreateUser, User>({
	method: "POST",
	endpoint: "/users",
	body: { name: "Ada" },
});
```

## URLs y parámetros de consulta

Una diagonal inicial en el endpoint conserva la ruta base (`/v1` en este caso).
Los endpoints absolutos reemplazan la URL base. Se conserva la consulta existente
y se agregan los parámetros serializados; por eso, una clave existente puede repetirse.

```ts
type Search = { page: number; tag: string[]; active: boolean };

await api.get<User[], Search>("/users", {
	params: { page: 2, tag: ["staff", "editor"], active: false },
});
// /v1/users?page=2&tag=staff&tag=editor&active=false
```

Los arreglos repiten la clave, los objetos se convierten en cadenas JSON y se omiten
los valores `null`/`undefined`. Los parámetros de instancia y solicitud se combinan
por clave; gana la solicitud. Si especificas el genérico del resultado y usas `params`,
especifica también el tipo de los parámetros (su tipo predeterminado es `undefined`).

Para otra codificación, configura `paramsSerializer` en la instancia o solicitud.
Recibe un `Record<string, unknown>` y devuelve la cadena de consulta sin `?`.

## Cuerpos de solicitud

Por defecto, los objetos simples y arreglos se serializan como JSON. Las cadenas,
`Blob`, `ArrayBuffer`, arreglos tipados y cuerpos `ReadableStream` se envían sin cambios.
Configura el tipo de contenido correspondiente para texto o datos binarios; el
predeterminado es JSON. `null` y `undefined` no envían cuerpo, en lugar de enviar JSON `null`.

```ts
await api.post("/notes", "Hola", { type: ContentType.TEXT_PLAIN });

const form = new FormData();
form.append("name", "Ada");
form.append("avatar", new Blob(["bytes de imagen"]), "avatar.bin");
await api.post("/profile", form);

await api.post("/preferences", new URLSearchParams({ theme: "dark" }));
```

`FormData` elimina el `Content-Type` explícito para que Fetch agregue el delimitador
multipart. `URLSearchParams` usa `application/x-www-form-urlencoded`, salvo que hayas
configurado otro tipo distinto de JSON. Un objeto simple con
`type: ContentType.APPLICATION_FORM_DATA` se convierte en `FormData`; los arreglos
usan claves con índice, como `tag[0]`.

## Encabezados y autenticación

Los encabezados de instancia aceptan cualquier `HeadersInit`. **Actualmente, los
encabezados por solicitud tienen el tipo `Headers`**, así que créalos explícitamente:

```ts
await api.get<User>("/me", {
	headers: new Headers({ "Accept-Language": "es-MX" }),
	credentials: "include",
});
```

Los encabezados de la solicitud reemplazan los de instancia con la misma clave.
GET/HEAD eliminan `Content-Type`. `secure` es `true` por defecto; `secure: false`
elimina `Authorization`. **No** exige HTTPS, desactiva cookies ni cambia la verificación
TLS. Fetch controla las cookies mediante `credentials` y las políticas del navegador.

:::caution[Las URLs absolutas conservan la configuración de instancia]
Un endpoint absoluto también recibe los encabezados y parámetros predeterminados
del cliente. No uses un cliente autenticado con un origen que no sea de confianza.
Usa otro cliente sin credenciales.
:::

## Lectura de respuestas

`responseType` controla la lectura independientemente del preset:

| Valor | Payload antes de aplicar la estructura del preset |
| --- | --- |
| `auto` (predeterminado) | Se deduce del estado, la disponibilidad del cuerpo y `Content-Type`. |
| `json` | JSON procesado; un cuerpo vacío produce `undefined`. |
| `text` | `string` |
| `blob` | `Blob` |
| `arrayBuffer` | `ArrayBuffer` |
| `stream` | `ReadableStream<Uint8Array> \| null`; tú lo consumes. |
| `none` | `undefined`; omite la lectura del cuerpo, no la validación del estado. |

```ts
const { payload: csv } = await api.get<string>("/export", { responseType: "text" });
const { payload: file } = await api.get<Blob>("/archive", { responseType: "blob" });
const { response } = await api.head<undefined>("/health");
console.log(csv.length, file.size, response.status);
```

`auto` reconoce JSON (incluido `+json`), los tipos de texto y binarios compatibles,
y respuestas vacías como 204/205. Un 304 no tiene cuerpo procesado, pero los presets
incluidos lo rechazan por estar fuera de 2xx. Si falta `Content-Type`, se interpreta
como JSON; para tipos desconocidos, especifica `responseType`.

Las respuestas JSON y de texto se clonan por defecto para poder leer
`result.response` otra vez. Los cuerpos binarios se consumen sin clonarse; usa
`clone: true` solo si necesitas otra copia. `clone: false` también evita la rama
adicional para JSON/texto. Clonar cuerpos grandes o streams puede acumular muchos
datos en memoria si no consumes ambas ramas.

Continúa con [errores](../errors/) y [progreso de descarga](../resilience/).
