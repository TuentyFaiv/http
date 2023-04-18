import type { ContentType, HttpMethod } from "../enums";

export interface HTTPContract {
  setAuth(token: string): void;
  setLang(lang: string): void;
}

type ConfigGlobalRequest = Partial<Omit<
HTTPConfigConnection<unknown>,
"body" | "params" | "type" | "endpoint" | "errorMessage" | "method"
>>;

export interface HTTPConfigInitial extends ConfigGlobalRequest {
  swal?: CustomSwal;
  storage?: CustomStorage | CustomStorageAsync;
  headers?: {
    Authorization?: string;
    "Content-Type"?: HTTPConfigConnection<unknown>["type"];
    "Accept-Language"?: string;
  };
  params?: Record<string, unknown>;
}

export interface HTTPConfigRequest {
  signal?: AbortSignal;
  body?: string | FormData;
  method: HttpMethod;
  headers: Headers;
}

export interface HTTPConfigConnection<T, P = undefined> extends Pick<HTTPConfigRequest, "signal" | "method"> {
  body?: T;
  params?: P;
  type?: ContentType;
  secure: boolean;
  secureParams: boolean;
  endpoint: string;
  errorMessage?: string;
  lang?: string;
  log?: boolean;
}

export type HTTPConfig = Partial<Pick<HTTPConfigConnection<unknown>, SecureOptions>>;

type ExcludeFields = "method" | "endpoint" | "body" | SecureOptions;
type SecureOptions = "secure" | "secureParams";

export type HTTPConfigMethod<T, P> = Omit<HTTPConfigConnection<T, P>, ExcludeFields> & HTTPConfig;
export type HTTPConfigGet<P> = HTTPConfigMethod<never, P>;

export type HTTPConnectionReturn<T> = {
  success: boolean;
  message: string;
  payload: T;
};

export interface HttpConnectionError {
  statusText: string;
  message: string;
  errors: {
    description?: string;
  };
  status: number;
}

export type HTTPBodyFiles<T> = {
  files?: File[];
  file: File;
} & T & Record<string, never>;

export interface HTTPLog {
  url?: string;
  request?: HTTPConfigRequest;
  response?: unknown;
}

export type CustomSwal = (config: SwalConfig) => Promise<unknown>;

export interface SwalConfig {
  title: string;
  text: string;
  icon: string;
  className: string;
  timer: number;
}

export interface CustomStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CustomStorageAsync {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
