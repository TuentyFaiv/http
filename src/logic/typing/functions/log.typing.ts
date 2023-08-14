import type { HttpConfigRequest } from "@typing/classes/http.typing";

export interface HttpLog<T> {
  url?: string;
  request?: HttpConfigRequest<T>;
  response?: unknown;
}
