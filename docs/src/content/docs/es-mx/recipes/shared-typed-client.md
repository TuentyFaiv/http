---
title: Comparte un cliente tipado
description: Centraliza la configuración de la API y expón funciones tipadas para cada endpoint.
sidebar:
  order: 1
---

Exporta un cliente configurado desde un módulo en lugar de crearlo en cada llamada. Este ejemplo espera objetos y arreglos JSON sin envoltura, por eso selecciona `rest` de forma explícita.

```ts
import { Http, rest } from "fetchzen";

export interface User {
  id: string;
  name: string;
}

type CreateUser = Pick<User, "name">;
type UserQuery = { page: number };

export const api = Http.create("https://api.example.com/v1", {
  preset: rest,
  timeout: 10_000,
  headers: { Accept: "application/json" },
});

export async function listUsers(page = 1): Promise<User[]> {
  const { data } = await api.get<User[], UserQuery>("/users", {
    params: { page },
  });
  return data;
}

export async function createUser(input: CreateUser): Promise<User> {
  const { data } = await api.post<CreateUser, User>("/users", input);
  return data;
}
```

- `get<Response, Params>` recibe las opciones como segundo argumento; `post<Body, Response>` recibe el cuerpo en el segundo y las opciones en el tercero. Los objetos se serializan como JSON de forma predeterminada.
- `/users` se agrega a la ruta base: la primera llamada al listado solicita `https://api.example.com/v1/users?page=1`.
- `rest` devuelve `{ data, status, headers, response }` sin extraer campos del JSON. El preset predeterminado es `envelope`, que expone `payload` y extrae el contenido de `data` o `payload`.
- Los genéricos describen el contenido esperado; **no** validan los datos del servidor. Si necesitas validación en tiempo de ejecución, pasa un `schema` compatible con Standard Schema en las opciones de la petición.
- No hay tiempo límite ni reintentos automáticos de forma predeterminada. El límite de 10 segundos del ejemplo es una decisión explícita de la aplicación.

## Decide qué compartir

`Http.create(baseUrl, config?)` comparte clientes por la cadena exacta de la URL
base de forma predeterminada. Una consulta compatible devuelve exactamente el mismo
cliente y sus hooks; la configuración solo inicializa un cliente nuevo. Las llamadas
posteriores no restablecen ni combinan valores predeterminados o hooks, incluido un
`fetch` inyectado.

El preset original queda fijo durante toda la vida del cliente. Otro objeto preset
explícito lanza un error aunque tenga la misma forma. Omitir `preset` afirma la
forma predeterminada `envelope`, por lo que consultar un cliente con otra forma
requiere pasar otra vez su preset original. Prefiere reutilizar la instancia tipada
exportada; conserva el objeto de preset personalizado original en lugar de recrearlo
con `extend()` en cada consulta.

```ts
const sameApi = Http.create("https://api.example.com/v1", { preset: rest });
console.log(sameApi === api); // true

sameApi.configure({ timeout: 5_000 });
// Las futuras solicitudes mediante api también usan el nuevo tiempo límite.
```

El registro solo vive en memoria, sin persistencia en el navegador ni uso compartido
entre pestañas o procesos. Esto no protege contra XSS. `cache: false` crea un cliente
privado sin leer ni escribir en el registro; exportarlo sigue compartiendo la
instancia del módulo.

## Actualiza los valores para futuras solicitudes

Usa `api.configure(update)` en el cliente existente; devuelve `void`.
Acepta `headers`, `params`, `secure`, `errorMessage`, `log`, `timeout`,
`retry`, `fetch`, `paramsSerializer` y `logger`.

```ts
api.configure({
  headers: { "Accept-Language": "en-US" },
  params: { locale: "en-US" },
  timeout: undefined,
});
```

Los campos enviados reemplazan los valores anteriores
(incluidas las colecciones completas de encabezados/parámetros); los omitidos se
conservan y un `undefined` explícito restablece los valores de la biblioteca.
Las opciones por solicitud siguen teniendo prioridad. Cada solicitud toma una
instantánea de los valores y las listas de hooks al comenzar, así que los cambios
afectan solicitudes posteriores, no pendientes. El estado capturado por los
callbacks sigue siendo responsabilidad de la aplicación.

`configure` no acepta `preset`, `cache` ni `hooks`. Para los hooks, usa
[`hook(name, handler)` y su función de cancelación](../../guides/hooks/).
Los encabezados/parámetros por solicitud se combinan con los predeterminados por clave.
Pasa opciones de Fetch como `credentials`, `signal` o su opción de caché de respuestas
`cache` a la solicitud, no a `create` ni a `configure`; esa caché es distinta del registro.

## Aísla las peticiones del servidor

En un servidor, crea un cliente privado con `cache: false` por cada petición de
usuario para su configuración o hooks específicos. No guardes estado de un usuario
en un cliente compartido global o de módulo. Esta opción de aislamiento también
sirve para pruebas y varios clientes independientes con la misma URL.

Continúa con [la renovación de autenticación](../auth-refresh/), [las pruebas con fetch inyectado](../testing-injected-fetch/)
o el ejemplo de [configuración](../../examples/configuration/).
