import type { ContentType } from "../enums/content";
import type { HttpMethod, HttpMethodLower } from "../enums/methods";

type SecureOptions = "secure" | "secureParams";
type ExcludeFields = SecureOptions | "method" | "endpoint" | "body";
type GlobalOptions = SecureOptions | "errorMessage" | "lang" | "log";

export type HttpMethods = {
  [key in Exclude<HttpMethodLower, "get">]: <T, R, P = undefined>(
    endpoint: string,
    body: T,
    config?: HttpConfigMethods<T, P>,
  ) => Promise<HttpConnectionReturn<R>>;
} & {
  get: <R, P = undefined>(endpoint: string, config?: HttpConfigGet<P>) => Promise<HttpConnectionReturn<R>>;
};

export interface HttpContract {
  setAuth(token: string): void;
  setLang(lang: string): void;
}

export type HttpGlobalConfig = Partial<Pick<HttpConfigConnection<unknown>, GlobalOptions>>;

export interface HttpConfigInitial extends HttpGlobalConfig {
  swal?: HttpAlert;
  storage?: HttpStorage | HttpStorageAsync;
  headers?: {
    Authorization?: string;
    "Content-Type"?: HttpConfigConnection<unknown>["type"];
    "Accept-Language"?: string;
  };
  params?: Record<string, unknown>;
}

export interface HttpConfigRequest<T> {
  signal?: AbortSignal;
  body?: T | FormData;
  method: HttpMethod;
  headers: Headers;
}

export interface HttpConfigConnection<T, P = undefined> extends Omit<HttpConfigRequest<T>, "headers"> {
  params?: P;
  type?: ContentType;
  secure: boolean;
  secureParams: boolean;
  endpoint: string;
  errorMessage?: string;
  lang?: string;
  log?: boolean;
}

export type HttpConfig = Partial<Pick<HttpConfigConnection<unknown>, SecureOptions>>;

export type HttpConfigMethods<T, P> = Omit<HttpConfigConnection<T, P>, ExcludeFields> & HttpConfig;
export type HttpConfigGet<P> = HttpConfigMethods<never, P>;

export type HttpConnectionReturn<T> = {
  success: boolean;
  message: string;
  payload: T;
};

export interface HttpConnectionError {
  statusText: string;
  message: string;
  errors: string[] | string | {
    description?: string;
  };
  status: number;
}

export type HttpAlert = (config: HttpAlertConfig) => Promise<unknown>;

export interface HttpAlertConfig {
  title: string;
  text: string;
  icon: string;
  className: string;
  timer: number;
}

export interface HttpStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HttpStorageAsync {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
