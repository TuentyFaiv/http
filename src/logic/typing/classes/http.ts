import type { ObjStrCustom } from "../globals/types";

export enum HTTPMetod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
}

export enum HTTPContentType {
  DOWNLOAD = "DOWNLOAD",
  JSON = "application/json",
  PDF = "application/pdf",
  FILES = "multipart/form-data",
  TEXT = "text/plain",
  CSV = "text/csv",
}

export interface HTTPContract {
  setAuth(token: string): void;
  get<R, P = undefined>(endpoint: string, config: HTTPConfigGet<P>): Promise<HTTPConnectionReturn<R>>;
  put<T, R, P = undefined>(endpoint: string, body: T, config: HTTPConfigMethod<T, P>): Promise<HTTPConnectionReturn<R>>;
  post<T, R, P = undefined>(endpoint: string, body: T, config: HTTPConfigMethod<T, P>): Promise<HTTPConnectionReturn<R>>;
  delete<T, R, P = undefined>(endpoint: string, body: T, config: HTTPConfigMethod<T, P>): Promise<HTTPConnectionReturn<R>>
}

export interface HTTPConfigInitial {
  params?: ObjStrCustom<unknown>;
  swal?: CustomSwal;
  storage?: CustomStorage;
  headers?: {
    Authorization?: string;
    "Content-Type"?: HTTPContentType;
    "Accept-Language"?: string;
  };
}

export interface HTTPConfigRequest {
  signal?: AbortSignal;
  body?: string | FormData;
  method: HTTPMetod;
  headers: Required<HTTPConfigInitial>["headers"];
}

export type HTTPConfigConnection<T, P = undefined> = {
  method: HTTPConfigRequest["method"];
  secure: boolean;
  endpoint: string;
  params?: P;
  body?: T;
  contentType?: HTTPContentType;
  errorMessage?: string;
  signal?: HTTPConfigRequest["signal"];
  lang?: string;
  log?: boolean;
};

export interface HTTPConfig {
  secure?: boolean;
}

type ExcludeFields = "method" | "endpoint" | "body" | "secure";

export type HTTPConfigMethod<T, P> = Omit<HTTPConfigConnection<T, P>, ExcludeFields> & HTTPConfig;
export type HTTPConfigGet<P> = HTTPConfigMethod<never, P>;

export type HTTPConnectionReturn<T> = {
  success: boolean;
  message: string;
  payload: T;
};

export interface HttpConnectionError {
  status: string;
  message: string;
  errors: {
    description?: string;
  };
  code: number;
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
