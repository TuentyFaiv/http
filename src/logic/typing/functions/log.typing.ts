import type { HttpConfigRequest } from "../classes/http.typing";

export interface HttpLog {
  url?: string;
  request?: HttpConfigRequest<string | undefined>;
  response?: unknown;
  [key: string]: unknown | undefined;
}
