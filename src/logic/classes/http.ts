import { Storage } from "@classes/storage";
import { ServiceError } from "@classes/errors";
import { validateContentType } from "@functions/validation";
import { throwError } from "@functions/throw";
import { logger } from "@functions/log";
import { ContentType } from "@typing/enums/content";
import { HttpMethod, HttpMethodLower } from "@typing/enums/methods";

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
} from "@typing/classes/http.typing";

type Http = HttpMethods & HttpInstance;

export class HttpInstance implements HttpContract {
  #api: string;
  #headers: Headers;
  #params: Required<HttpConfigInitial>["params"];
  #swal: HttpConfigInitial["swal"];
  #storage: Required<HttpConfigInitial>["storage"];
  #config: HttpGlobalConfig;

  static instance: Record<string, Http> = {};

  private constructor(api: string, config?: HttpConfigInitial) {
    this.#swal = config?.swal;
    this.#storage = config?.storage ?? new Storage();
    this.#config = {
      errorMessage: config?.errorMessage,
      secure: config?.secure,
      secureParams: config?.secureParams,
      lang: config?.lang,
      log: config?.log,
    };
    this.#api = api;

    this.#params = config?.params ?? {};
    this.#headers = new Headers({
      ...config?.headers,
      "Content-Type": ContentType.ApplicationJson,
    });

    this.#getStoraged();

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
              const { secure = true, secureParams = true, ...configConn } = configRequest;

              const {
                secure: secureGet = true,
                secureParams: secureParamsGet = true,
                ...configGet
              } = (body as unknown as HttpConfigGet<P>) ?? {};

              const connectionConfig: HttpConfigConnection<T, P> = {
                method: method.toUpperCase() as HttpMethod,
                endpoint,
                ...(method === HttpMethodLower.get ? {
                  secure: secureGet,
                  secureParams: secureParamsGet,
                  ...configGet,
                } : {
                  secure,
                  secureParams,
                  body,
                  ...configConn,
                }),
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
      this.#makeHeaders<T, P>(config);

      const request = this.#makeRequest(config);

      const petition = await fetch(request.url, request.config);

      const response = await this.#makeResponse<T, R, P>(petition, config);

      return response;
    } catch (error) {
      throw throwError(error, this.#swal);
    }
  }

  #makeHeaders<T, P>(config: HttpConfigConnection<T, P>) {
    this.#getStoraged();
    const content = config.type ?? this.#headers.get("Content-Type") ?? ContentType.ApplicationJson;
    const lang = this.#getConfig("lang", config) as string | undefined;

    if (!lang) {
      this.#headers.delete("Accept-Language");
    } else if (lang) {
      this.#headers.set("Accept-Language", lang);
    }

    if (config.method !== HttpMethod.GET) {
      this.#headers.set("Content-Type", content);
    } else {
      this.#headers.delete("Content-Type");
    }

    if (!this.#getConfig("secure", config)) this.#headers.delete("Authorization");
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

  #makeBody<T>(body: T | FormData) {
    switch (this.#headers.get("Content-Type")) {
      case ContentType.ApplicationFormData:
        this.#headers.delete("Content-Type");
        if (body instanceof FormData) return body;

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
        return parsedBody;
      default:
        if (body instanceof FormData) {
          const parsedJsonBody: Record<string, unknown> = {};

          body.forEach((value, key) => {
            parsedJsonBody[key] = value;
          });
          return JSON.stringify(parsedJsonBody);
        }
        return JSON.stringify(body);
    }
  }

  #makeRequest<T, P>(config: HttpConfigConnection<T, P>) {

    const body = this.#makeBody(config.body);
    const params = this.#makeParams<P>(config);

    const requestConfig: HttpConfigRequest<string> = {
      method: config.method,
      headers: this.#headers,
      ...(config.method === HttpMethod.GET ? {} : { body }),
      ...(config.signal ? { signal: config.signal } : {}),
    };
    const url = `${this.#api === "no-api" ? "" : this.#api}${config.endpoint}${params}`;

    const request = { url, config: requestConfig };

    if (this.#getConfig("log", config)) logger(request);

    return request;
  }

  async #makeResponse<T, R, P>(response: Response, config: HttpConfigConnection<T, P>): Promise<HttpConnectionReturn<R>> {
    const responseType = response.headers.get("Content-Type") ?? ContentType.ApplicationJson;
    const contentType = validateContentType(responseType);
    const responseJson = contentType.json ? await response.json() : {};

    if (this.#getConfig("log", config)) logger({ response: contentType.json ? responseJson : response });

    if (
      (responseJson?.error && !responseJson?.result)
      || (responseJson?.detail && !responseJson.detail?.success)
      || (responseJson?.payload && !responseJson?.success)
      || responseJson?.errors
      || !response.ok
    ) {
      const statusText = `${response.status}: ${response.statusText || responseJson?.error}`;
      throw new ServiceError({
        message: this.#getConfig("errorMessage", config)
          ?? responseJson?.error
          ?? responseJson?.message
          ?? responseJson?.detail?.message,
        status: responseJson?.code ?? response.status,
        statusText: responseJson?.result ?? responseJson?.status ?? statusText,
        errors: responseJson?.errors ?? responseJson?.detail?.errors ?? {
          description: response.statusText,
        },
      });
    }

    if (contentType.file) {
      return {
        success: true,
        message: "Success to download",
        payload: await response.blob() as R,
      };
    }

    if (contentType.json) {
      const payload = responseJson?.data ?? responseJson?.payload ?? responseJson;

      return {
        success: !!responseJson?.result || responseJson?.success || Object.keys(payload).length > 0,
        message: responseJson?.error ?? responseJson?.message ?? "",
        payload,
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
    const option = config[key] ?? this.#config[key];

    return option;
  }

  #getStoraged() {
    const token = this.#storage.getItem("sessionId") ?? "";

    if (token instanceof Promise) {
      token.then((value) => {
        this.#headers.set("Authorization", `Bearer ${value ?? ""}`);
      });
    } else {
      this.#headers.set("Authorization", `Bearer ${token}`);
    }
  }

  public setAuth = (token: string) => {
    this.#headers.set("Authorization", `Bearer ${token}`);
    this.#storage.setItem("sessionId", token);
  };

  public setLang = (lang: string) => {
    this.#headers.set("Accept-Language", lang);
  };
}
