---
title: Renueva el token sin duplicar solicitudes
description: Comparte una renovación en curso y repite una sola vez las lecturas autenticadas.
sidebar:
  order: 2
---

Esta receta para el navegador mantiene el token de acceso en memoria. Supone que `/refresh` usa una cookie de renovación HttpOnly y devuelve JSON `{ "token": "..." }`. Configura las cookies, CORS y las protecciones contra CSRF en tu servidor; `credentials: "include"` no proporciona esas protecciones por sí solo.

```ts
import { Http, rest } from "@tuentyfaiv/http";
import type { HttpFetch } from "@tuentyfaiv/http";

export function createSessionClient(
  initialToken: string,
  transport: HttpFetch = (url, init) => globalThis.fetch(url, init),
) {
  let token = initialToken;
  let refreshing: Promise<string> | undefined;
  const base = "https://api.example.com";
  const auth = Http.create(base, {
    preset: rest,
    cache: false,
    fetch: transport,
    timeout: 10_000,
    retry: 0,
  });
  const api = Http.create(base, {
    preset: rest,
    cache: false,
    fetch: transport,
    retry: 0,
  });

  function refreshToken(): Promise<string> {
    refreshing ??= auth
      .post<undefined, { token: string }>("/refresh", undefined, {
        credentials: "include",
      })
      .then(({ data }) => {
        if (typeof data?.token !== "string" || !data.token) {
          throw new Error("La respuesta de renovación no contiene un token");
        }
        token = data.token;
        return token;
      })
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  }

  api.hook("request", ({ init }) => {
    init.headers.set("Authorization", `Bearer ${token}`);
  });

  api.hook("response", async (response, { url, init }) => {
    if (response.status !== 401 || !["GET", "HEAD"].includes(init.method)) {
      return;
    }

    init.signal?.throwIfAborted();
    const sentToken = init.headers.get("Authorization");
    // Un 401 tardío puede corresponder al token que ya reemplazamos.
    const nextToken = sentToken === `Bearer ${token}`
      ? await refreshToken()
      : token;
    init.signal?.throwIfAborted();

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${nextToken}`);
    return transport(url, { ...init, headers });
  });

  return api;
}
```

## Por qué solo se repite una vez

Los hooks de respuesta se ejecutan antes de leer el cuerpo y validar con el preset. Al devolver la `Response` de la petición repetida, el flujo normal la valida; con `rest`, un segundo 401 rechaza la promesa con `ServiceError`.

La llamada directa al transporte **no** vuelve a pasar por los hooks ni los reintentos automáticos del cliente. No hace falta un encabezado para marcar la repetición. Usar el mismo transporte inyectado también permite probarla. Los hooks de error pueden observar o reemplazar un error, pero no recuperarse devolviendo una respuesta exitosa.

Ambos clientes usan `cache: false`: de lo contrario, compartir la URL base los convertiría en la misma instancia almacenada en caché. El cliente de renovación no tiene el hook de renovación, lo que evita la recursión. Solo las renovaciones que coinciden en el tiempo comparten una promesa; una vez que termina, otro fallo puede iniciar una nueva.

## Límites

- Solo se repiten peticiones GET/HEAD. Reintentar escrituras requiere un acuerdo de idempotencia con el servidor; los cuerpos de tipo stream ya consumidos no se pueden reutilizar directamente.
- La señal de quien llama se conserva al repetir la petición, pero no cancela la renovación compartida. Esa llamada tiene su propio límite de 10 segundos. La cancelación se revisa de nuevo después de esperar.
- Los fallos de renovación se propagan; los errores HTTP, de red y de tiempo límite no siempre son `ServiceError`. Decide donde haces la llamada si debes mostrar un error o pedir que se inicie sesión.
- Crea un cliente por sesión y descártalo al cerrar sesión. No compartas este cierre que guarda el token entre usuarios en un servidor, y úsalo solo con endpoints de confianza.

Consulta también: [cliente tipado compartido](../shared-typed-client/) y [cancelación de peticiones obsoletas](../cancelling-stale-requests/).
