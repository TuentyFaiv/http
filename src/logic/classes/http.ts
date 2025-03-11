import { ServiceError } from "./errors.js";
import { validateContentType } from "../functions/validation.js";
import { throwError } from "../functions/throw.js";
import { logger } from "../functions/log.js";
import { parseBody } from "../functions/parse.js";
import { ContentType } from "../typing/enums/content.js";
import { HttpMethod, HttpMethodLower } from "../typing/enums/methods.js";

import type {
  HttpContract,
  HttpConfigInitial,
  HttpConfigConnection,
  HttpConfigRequest,
  HttpConfigGet,
  HttpConfigMethods,
  HttpConnectionReturn,
  HttpGlobalConfig,
  HttpMethods,
  HttpGlobalAction,
} from "../typing/classes/http.typing.js";
import type { HttpLog } from "../typing/functions/log.typing.js";

type Http = HttpMethods & HttpInstance;

export class HttpInstance implements HttpContract {
  #api: string;
  #headers: Headers;
  #params: Required<HttpConfigInitial>["params"];
  #swal: HttpConfigInitial["swal"];
  #config: HttpGlobalConfig;
  #thrower: (config: { json: Record<string, unknown>; response: Response }) => void = ({ json, response }) => {
    if ((json?.error && !json?.result)
      || (json?.detail && !(json.detail as { success?: boolean })?.success)
      || (json?.payload && !json?.success)
      || json?.errors
      || !response.ok) {
      const statusText = `${response.status}: ${response.statusText || json?.error}`;
      throw new ServiceError({
        message: (this.#getConfig("errorMessage", this.#config)
          ?? json?.error
          ?? json?.message
          ?? (json?.detail as { message: string; })?.message) as string,
        status: json?.code as number ?? response.status,
        statusText: (json?.result ?? json?.status ?? statusText) as string,
        errors: json?.errors ?? (json?.detail as { errors: string[]; })?.errors ?? {
          description: json?.error ?? response.statusText,
        },
      });
    }
  };

  static instance: Record<string, Http> = {};

  private constructor(api: string, config?: HttpConfigInitial) {
    this.#swal = config?.swal;
    this.#config = {
      errorMessage: config?.errorMessage,
      secure: config?.secure,
      secureParams: config?.secureParams,
      log: config?.log,
    };
    this.#api = api;

    this.#params = config?.params ?? {};
    this.#headers = new Headers({
      ...config?.headers,
      "Content-Type": ContentType.ApplicationJson,
    });

    Object.freeze(this);
  }

  static create(api: string, config?: HttpConfigInitial) {
    if (!HttpInstance.instance[api]) {
      const instance = new HttpInstance(api, config);

      const handler: ProxyHandler<HttpInstance> = {
        get(target, method: string) {
          if (Object.values(HttpMethodLower).includes(method as HttpMethodLower)) {
            return async <T, R, P = undefined>(
              endpoint: string,
              body: T,
              configRequest: HttpConfigMethods<T, P> = {},
            ): Promise<HttpConnectionReturn<R>> => {
              const {
                secure = true,
                secureParams = true,
                headers = new Headers(),
                ...options
              } = method === HttpMethodLower.get ? (body as HttpConfigGet<P> ?? {}) : configRequest;

              const connectionConfig: HttpConfigConnection<T, P> = {
                method: method.toUpperCase() as HttpMethod,
                endpoint,
                secure,
                secureParams,
                headers,
                ...options,
                ...(method !== HttpMethodLower.get ? {
                  body,
                } : {}),
              };

              const response = await target.#connection<T, R, P>(connectionConfig);

              return response;
            };
          }

          return Reflect.get(target, method);
        },
      };

      HttpInstance.instance[api] = new Proxy(instance, handler) as Http;
    }

    return HttpInstance.instance[api];
  }

  async #connection<T, R, P>(config: HttpConfigConnection<T, P>): Promise<HttpConnectionReturn<R>> {
    try {
      const request = this.#makeRequest(this.#makeHeaders(config));

      const petition = await fetch(request.url, request.config);
      const response = await this.#makeResponse<T, R, P>(petition, config);

      return response;
    } catch (error) {
      throw throwError(error, this.#swal);
    }
  }

  #makeHeaders<T, P>(config: HttpConfigConnection<T, P>): HttpConfigConnection<T, P> {
    const { headers, type } = config;
    const requestHeaders = new Headers(headers);
    const preConfigHeaders = new Headers(this.#headers);

    const content = type ?? this.#headers.get("Content-Type") ?? ContentType.ApplicationJson;
    if (!requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", content);
    }

    preConfigHeaders.forEach((value, key) => {
      if (!requestHeaders.has(key)) {
        requestHeaders.set(key, value);
      }
    });

    if (config.method === HttpMethod.GET) {
      requestHeaders.delete("Content-Type");
    }

    if (!this.#getConfig("secure", config)) {
      requestHeaders.delete("Authorization");
    }

    return {
      ...config,
      type,
      headers: requestHeaders,
    };
  }

  #makeParams<P>(config: HttpConfigConnection<unknown, P>) {
    const secureParams = this.#getConfig("secureParams", config) as boolean | undefined;

    const toParse = { ...this.#params, ...config.params };
    const parsedParams = Object.entries(toParse).reduce((acc, [key, value]) => {
      const isUnique = (
        typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
      );
      const isObject = Array.isArray(value) || typeof value === "object";

      const paramObj = isObject ? JSON.stringify(value) : "";
      const param = isUnique ? value : paramObj;
      const keyUrl = !secureParams ? key : encodeURIComponent(key);
      const paramUrl = !secureParams ? param : encodeURIComponent(param);

      if (isUnique || isObject) return [...acc, `${keyUrl}=${paramUrl}`];

      return acc;
    }, [] as string[]).join("&");

    if (parsedParams.length > 0) return `?${parsedParams}`;

    return "";
  }

  #makeRequest<T, P>(config: HttpConfigConnection<T, P>) {
    const {
      // eslint-disable-next-line no-unused-vars
      body: B,
      // eslint-disable-next-line no-unused-vars
      params: PA,
      // eslint-disable-next-line no-unused-vars
      type: C,
      // eslint-disable-next-line no-unused-vars
      log: L,
      // eslint-disable-next-line no-unused-vars
      arrayBuffer: AB,
      // eslint-disable-next-line no-unused-vars
      errorMessage: EM,
      // eslint-disable-next-line no-unused-vars
      headers: H,
      // eslint-disable-next-line no-unused-vars
      secure: S,
      // eslint-disable-next-line no-unused-vars
      secureParams: SP,
      // eslint-disable-next-line no-unused-vars
      thrower: TR,
      endpoint,
      method,
      signal,
      ...options
    } = config;
    const { body, headers } = parseBody(config);
    const params = this.#makeParams<P>(config);

    const request: HttpConfigRequest<string> = {
      method,
      headers,
      ...options,
      ...(method === HttpMethod.GET ? {} : { body }),
      ...(signal ? { signal } : {}),
    };
    const url = `${this.#api === "no-api" ? "" : this.#api}${endpoint}${params}`;

    this.#show(config, {
      url,
      request,
      params,
    });

    return { url, config: request };
  }

  async #makeResponse<T, R, P>(response: Response, config: HttpConfigConnection<T, P>): Promise<HttpConnectionReturn<R>> {
    const responseType = response.headers.get("Content-Type") ?? ContentType.ApplicationJson;
    const contentType = validateContentType(responseType);
    const responseJson = contentType.json ? await response.json() : {};    
    const thrower = config.thrower ?? this.#thrower;

    this.#show(config, { response: contentType.json ? responseJson : response });

    thrower({ json: responseJson, response });

    if (contentType.file) {
      return {
        success: true,
        message: "Success to download",
        payload: await (config.arrayBuffer ? response.arrayBuffer() : response.blob()) as R,
        response,
      };
    }

    if (contentType.json) {
      const payload = responseJson?.data ?? responseJson?.payload ?? responseJson;

      return {
        success: !!responseJson?.result || responseJson?.success || Object.keys(payload).length > 0,
        message: responseJson?.error ?? responseJson?.message ?? "",
        payload,
        response,
      };
    }

    if (contentType.text) {
      return {
        success: true,
        message: response.statusText,
        payload: await response.text() as R,
        response,
      };
    }

    if (contentType.text) {
      return {
        success: true,
        message: "Success",
        payload: await response.text() as R,
        response,
      };
    }

    throw new ServiceError({
      message: "response content type not supported",
      status: response.status,
      statusText: `${response.status}: ${response.statusText}`,
      errors: {
        description: response.statusText,
      },
    });
  }

  #getConfig(key: keyof HttpGlobalConfig, config: Partial<HttpConfigConnection<unknown, unknown>>) {
    return config[key] ?? this.#config[key];
  }

  #show<T, P>(config: HttpConfigConnection<T, P>, request: HttpLog) {
    if (this.#getConfig("log", config)) logger(request);
  }

  public global = async <T = string>(config: HttpGlobalAction<T>): Promise<void> => {
    const { headers, params, thrower } = await config({
      headers: this.#headers,
      params: this.#params as Record<string, T>,
      thrower: this.#thrower,
    });

    this.#headers = headers;
    this.#params = params;
    this.#thrower = thrower;
  };
}
