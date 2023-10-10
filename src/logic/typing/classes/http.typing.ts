import type { ContentType } from "../enums/content";
import type { HttpMethod, HttpMethodLower } from "../enums/methods";

type ExcludeFields = "method" | "endpoint" | "body";
type GlobalOptions = "secure" | "secureParams" | "errorMessage" | "log";

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
  global<T>(config: HttpGlobalAction<T>): Promise<void>;
}

export type HttpGlobalConfig = Partial<Pick<HttpConfigConnection<unknown>, GlobalOptions>>;

export interface HttpConfigInitial extends HttpGlobalConfig {
  swal?: HttpAlert;
  headers?: {
    Authorization?: string;
    "Content-Type"?: HttpConfigConnection<unknown>["type"];
    "Accept-Language"?: string;
  } | Headers;
  params?: Record<string, unknown>;
}

export interface HttpConfigRequest<T> extends Omit<RequestInit, "body"> {
  signal?: AbortSignal;
  body?: T | FormData;
  method: HttpMethod;
  headers: Headers;
}

export interface HttpConfigConnection<T, P = undefined> extends HttpConfigRequest<T> {
  params?: P;
  type?: ContentType;
  secure: boolean;
  secureParams: boolean;
  endpoint: string;
  errorMessage?: string;
  arrayBuffer?: boolean;
  log?: boolean;
}

export type HttpConfigMethods<T, P> = Partial<Omit<HttpConfigConnection<T, P>, ExcludeFields>>;
export type HttpConfigGet<P> = HttpConfigMethods<never, P>;

export type HttpConnectionReturn<T> = {
  success: boolean;
  message: string;
  payload: T;
  response: Response;
};

export interface HttpConnectionError {
  statusText: string;
  message: string;
  errors: string[] | string | {
    description?: string;
  };
  status: number;
  icon?: string;
  time?: number;
  title?: string;
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

export interface HttpGlobalActionConfig<T> {
  headers: Headers;
  params: Record<string, T>;
}

export type HttpGlobalAction<T> = (config: HttpGlobalActionConfig<T>) => Promise<HttpGlobalActionConfig<T>>;
