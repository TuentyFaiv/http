---
title: Cancela peticiones obsoletas
description: Cancela la búsqueda anterior y evita que los resultados tardíos actualicen la interfaz.
sidebar:
  order: 3
---

Usa un controlador por búsqueda y comprueba que siga siendo la petición más reciente. Cancelar ahorra trabajo cuando el transporte lo admite; comprobar la identidad también evita que resultados obsoletos actualicen la interfaz.

```ts
import { Http, rest } from "@tuentyfaiv/http";

interface SearchItem {
  id: string;
  title: string;
}

export function createSearch(
  render: (items: SearchItem[]) => void,
  reportError: (error: unknown) => void,
) {
  const api = Http.create("https://api.example.com", {
    preset: rest,
    cache: false,
  });
  let active: AbortController | undefined;

  async function search(query: string): Promise<void> {
    active?.abort();
    const controller = new AbortController();
    active = controller;

    try {
      const { data } = await api.get<SearchItem[], { q: string }>("/search", {
        params: { q: query },
        signal: controller.signal,
        timeout: 5_000,
      });
      if (active === controller && !controller.signal.aborted) {
        render(data);
      }
    } catch (error) {
      if (active !== controller || controller.signal.aborted) return;
      reportError(error);
    } finally {
      if (active === controller) active = undefined;
    }
  }

  function dispose(): void {
    active?.abort();
    active = undefined;
  }

  return { search, dispose };
}
```

Llama a `search(query)` cuando cambie el campo de búsqueda y a `dispose()` cuando se quite la vista. Una señal cancelada no se puede reutilizar, por eso cada búsqueda recibe un controlador nuevo.

`signal` y un `timeout` positivo se combinan: cualquiera puede cancelar el fetch. No hay tiempo límite de forma predeterminada; `timeout: 0` desactiva un límite heredado. Un `abort()` normal produce `AbortError`, mientras que el tiempo límite de la biblioteca usa `TimeoutError`. Este ejemplo ignora las peticiones reemplazadas o canceladas al quitar la vista, pero reporta los tiempos de espera agotados y otros fallos de la petición actual.

Un fetch inyectado debe respetar `init.signal` por su cuenta. Cancelar no garantiza que el servidor haya dejado de procesar la petición.

Consulta también: [pruebas con fetch inyectado](../testing-injected-fetch/).
