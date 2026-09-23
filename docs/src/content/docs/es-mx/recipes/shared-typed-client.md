---
title: Comparte un cliente tipado
description: Centraliza la configuración de la API y expón funciones tipadas para cada endpoint.
sidebar:
  order: 1
---

Exporta un cliente configurado desde un módulo en lugar de crearlo en cada llamada. Este ejemplo espera objetos y arreglos JSON sin envoltura, por eso selecciona `rest` de forma explícita.

```ts
import { Http, rest } from "@tuentyfaiv/http";

export interface User {
  id: string;
  name: string;
}

type CreateUser = Pick<User, "name">;
type UserQuery = { page: number };

export const api = Http.create("https://api.example.com/v1", {
  preset: rest,
  cache: false,
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

`Http.create()` guarda las instancias por URL base de forma predeterminada. Otra llamada con la misma URL devuelve el cliente existente e ignora la nueva configuración, incluso si cambia el preset o el `fetch` inyectado. `cache: false` evita ese registro; exportar el cliente sigue compartiendo la instancia del módulo.

En un servidor, crea un cliente independiente con `cache: false` por cada petición de usuario si los encabezados o los cierres de los hooks contienen credenciales. No guardes estado de un usuario en una instancia global del módulo.

Continúa con [la renovación de autenticación](../auth-refresh/) o [las pruebas con fetch inyectado](../testing-injected-fetch/).
