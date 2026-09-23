---
title: Prueba con fetch inyectado
description: Verifica URLs, cuerpos de petición y errores sin hacer solicitudes de red.
sidebar:
  order: 5
---

Inyecta un `HttpFetch` en lugar de reemplazar el fetch global. Esta prueba con Vitest verifica la construcción de URLs, la serialización, la estructura de la respuesta y el manejo de errores HTTP, todo en memoria.

```ts
import { expect, it } from "vitest";
import { Http, rest, ServiceError } from "@tuentyfaiv/http";
import type { HttpFetch } from "@tuentyfaiv/http";

it("crea un usuario y reporta una petición fallida", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    const failed = calls.length > 1;
    return new Response(
      JSON.stringify(failed ? { message: "No disponible" } : { id: "u1" }),
      {
        status: failed ? 503 : 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  const api = Http.create("https://api.test/v1", {
    preset: rest,
    cache: false,
    fetch,
    retry: 0,
  });

  const result = await api.post<{ name: string }, { id: string }>("/users", {
    name: "Ana",
  });

  expect(result.data).toEqual({ id: "u1" });
  expect(result.status).toBe(201);
  expect(calls[0]?.url).toBe("https://api.test/v1/users");
  expect(calls[0]?.init?.method).toBe("POST");
  expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Ana" }));
  expect(new Headers(calls[0]?.init?.headers).get("Content-Type"))
    .toBe("application/json");

  await expect(api.get("/users")).rejects.toBeInstanceOf(ServiceError);
  expect(calls).toHaveLength(2);
});
```

## Simula el transporte de forma realista

- `HttpFetch` recibe una URL como cadena y un `RequestInit` opcional, y devuelve `Promise<Response>`. Crea una `Response` nueva por llamada: el cuerpo de una respuesta solo se puede consumir una vez.
- `cache: false` evita reutilizar el fetch o preset del cliente de otra prueba con la misma URL. Los reintentos automáticos están desactivados de forma predeterminada; aquí `retry: 0` hace explícita esa decisión.
- Incluye `Content-Type` en las respuestas simuladas: el valor predeterminado `responseType: "auto"` usa los metadatos de la respuesta para elegir cómo leerla. Esta receta usa `rest`, así que `result.data` contiene todo el cuerpo JSON, no el contenido extraído de un campo `data`.
- Sin un fetch inyectado, el cliente resuelve `globalThis.fetch` al hacer la petición.
- Para probar tiempos límite o cancelaciones, el transporte simulado debe rechazar con `init.signal.reason` si la señal ya está cancelada, o escuchar su evento `abort`. Una simulación que ignora las señales no sirve para demostrar la cancelación del transporte.

Esta prueba no cubre CORS, cookies ni un servidor real. Mantén pruebas de integración separadas para esos casos.

Consulta también: [cliente tipado compartido](../shared-typed-client/) y [renovación del token sin solicitudes duplicadas](../auth-refresh/).
