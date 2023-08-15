import type { HttpConfigRequest } from "../classes/http.typing";

export interface HttpLog<T> {
  url?: string;
  request?: HttpConfigRequest<T>;
  response?: unknown;
}
