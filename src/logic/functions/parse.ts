import { ContentType } from "../typing/enums/content";

import type { HttpConfigConnection } from "../typing/classes/http.typing";

export function parseBody<T, P>(config: HttpConfigConnection<T, P>): Pick<HttpConfigConnection<string, P>, "body" | "headers"> {
  const { body, headers } = config;
  const content: ContentType = headers.get("Content-Type") as ContentType ?? ContentType.ApplicationJson;

  if (content === ContentType.ApplicationFormData) {
    headers.delete("Content-Type");
    if (body instanceof FormData) {
      return { body, headers };
    }

    const parsedBody = new FormData();

    const addItem = (key: string, value: unknown, index?: number) => {
      const name = index ? `${key}[${index}]` : key;
      if (value instanceof File) {
        parsedBody.append(name, value, value.name);
      }

      if (value instanceof Blob || typeof value === "string") {
        parsedBody.append(name, value);
      }

      if (typeof value === "number" || typeof value === "boolean") {
        parsedBody.append(name, value.toString());
      }

      if (typeof value === "object") {
        parsedBody.append(name, JSON.stringify(value));
      }
    };

    Object.entries(body as Record<string, unknown>).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        (value as unknown[]).forEach((item, index) => {
          addItem(key, item, index);
        });
      } else {
        addItem(key, value);
      }
    });
    return { body: parsedBody, headers };
  }

  if (body instanceof FormData) {
    const parsedBody: Record<string, unknown> = {};

    body.forEach((value, key) => {
      parsedBody[key] = value;
    });
    return {
      body: JSON.stringify(parsedBody),
      headers,
    };
  }

  return {
    body: JSON.stringify(body),
    headers,
  };
}
