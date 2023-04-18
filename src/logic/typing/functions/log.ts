import { HttpConfigRequest } from "../classes/http";

export interface HttpLog<T> {
  url?: string;
  request?: HttpConfigRequest<T>;
  response?: unknown;
}
