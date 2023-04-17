import { ContentType, HttpMethod, HttpMethodLower } from "../typing/enums";
import { ServiceError, throwError } from "../utils/errors";

import type {
  HTTPContract,
  HTTPConfigInitial,
  HTTPConfigConnection,
  HTTPConfigRequest,
  HTTPConfigGet,
  HTTPConfigMethod,
  HTTPConnectionReturn,
  HTTPBodyFiles,
  HTTPLog,
} from "../typing/classes/http";

import { Storage } from "./storage";

type Http = {
  [key in Exclude<HttpMethodLower, "get">]: <T, R, P = undefined>(
    endpoint: string,
    body: T,
    config?: HTTPConfigMethod<T, P>,
  ) => Promise<HTTPConnectionReturn<R>>;
} & {
  get: <R, P = undefined>(endpoint: string, config?: HTTPConfigGet<P>) => Promise<HTTPConnectionReturn<R>>;
} & HttpInstance;

export class HttpInstance implements HTTPContract {
  #api: string;
  #headers: Headers;
  #params: Required<HTTPConfigInitial>["params"];
  #swal: HTTPConfigInitial["swal"];
  #storage: Required<HTTPConfigInitial["storage"]>;

  static instance: Record<string, Http> = {};

  private constructor(api: string, config?: HTTPConfigInitial) {
    this.#swal = config?.swal;
    this.#storage = config?.storage ?? new Storage();
    this.#api = api;

    this.#params = config?.params ?? {};
    this.#headers = new Headers({
      ...config?.headers,
      "Content-Type": ContentType.ApplicationJson,
    });

    const token = this.#storage.getItem("sessionId") ?? "";

    if (token instanceof Promise) {
      token.then((value) => {
        this.#headers.set("Authorization", `Bearer ${value ?? ""}`);
      });
    } else {
      this.#headers.set("Authorization", `Bearer ${token}`);
    }

    Object.freeze(this);
  }

  static create(api: string, config?: HTTPConfigInitial) {
    if (!HttpInstance.instance[api]) {
      const instance = new HttpInstance(api, config);

      const handler: ProxyHandler<HttpInstance> = {
        get(target, method: string) {
          if (Object.values(HttpMethodLower).includes(method as HttpMethodLower)) {
            return async <T, R, P = undefined>(
              endpoint: string,
              body: T,
              { secure = true, secureParams = true, ...configRequest }: HTTPConfigMethod<T, P> = {},
            ): Promise<HTTPConnectionReturn<R>> => {

              const {
                secure: secureGet = true,
                secureParams: secureParamsGet = true,
                ...configRequestGet
              } = body as unknown as HTTPConfigGet<P>;

              const connectionConfig: HTTPConfigConnection<T, P> = {
                method: method.toUpperCase() as HttpMethod,
                endpoint,
                ...(method === HttpMethodLower.get ? {
                  secure: secureGet,
                  secureParams: secureParamsGet,
                  ...configRequestGet,
                } : {
                  secure,
                  secureParams,
                  body,
                  ...configRequest,
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

  async #connection<T, R, P>({
    type,
    method,
    signal,
    ...config
  }: HTTPConfigConnection<T, P>): Promise<HTTPConnectionReturn<R>> {
    try {
      this.#makeHeaders({ type, method, secure: config.secure, lang: config.lang });

      const body = this.#makeBody(config.body, type);

      const requestConfig: HTTPConfigRequest = {
        method,
        headers: this.#headers,
        ...(method === HttpMethod.GET ? {} : { body }),
        ...(signal ? { signal } : {}),
      };

      const params = this.#makeParams(config.params, config.secureParams);
      const url = `${this.#api}${config.endpoint}${params}`;

      if (config.log) this.#log({ url, request: requestConfig });

      const response = await fetch(url, requestConfig);

      const responseType = response.headers.get("Content-Type") ?? ContentType.ApplicationJson;

      const contentType = this.#whatContentType(responseType);

      if (contentType.file) {
        if (!response.ok) {
          if (config.log) this.#log({ response });
          throw new ServiceError({
            message: config.errorMessage ?? "error to request file",
            code: response.status,
            status: "error",
            errors: {
              description: response.statusText,
            },
          });
        }
        return {
          success: true,
          message: "Success to download",
          payload: await response.blob() as R,
        };
      }

      if (contentType.json) {
        const responseJson = await response.json();

        if (config.log) this.#log({ response: responseJson });
        if ((responseJson.error && !responseJson.result) || responseJson.errors || !response.ok) {
          throw new ServiceError({
            message: config.errorMessage ?? responseJson?.error ?? responseJson.message,
            code: responseJson?.error ?? responseJson?.code ?? "",
            status: responseJson?.result ?? responseJson?.status ?? "",
            errors: responseJson?.error ?? responseJson.errors ?? "",
          });
        }

        const hasPayload = (
          (Object.hasOwn(responseJson, "data") || Object.hasOwn(responseJson, "payload"))
          && (Object.hasOwn(responseJson, "result") || Object.hasOwn(responseJson, "success"))
          && (Object.hasOwn(responseJson, "message") || Object.hasOwn(responseJson, "error"))
        );

        const payload = hasPayload ? responseJson.data ?? responseJson.payload : responseJson;

        return {
          success: !!responseJson.result || responseJson.success || Object.keys(payload).length > 0,
          message: responseJson.error ?? responseJson.message ?? "",
          payload,
        };
      }

      throw new ServiceError({
        message: "response content type not supported",
        code: response.status,
        status: "error",
        errors: {
          description: response.statusText,
        },
      });
    } catch (error) {
      throw throwError(error, this.#swal);
    }
  }

  #makeHeaders<T, P>({ type, ...config }: Pick<HTTPConfigConnection<T, P>, "type" | "lang" | "method" | "secure">) {
    const content = type ?? this.#headers.get("Content-Type") ?? ContentType.ApplicationJson;

    if (!config.lang) {
      this.#headers.delete("Accept-Language");
    } else {
      this.#headers.set("Accept-Language", config.lang);
    }

    if (content !== ContentType.ApplicationFormData && config.method !== HttpMethod.GET) {
      this.#headers.set("Content-Type", content);
    } else {
      this.#headers.delete("Content-Type");
    }

    if (!config.secure) this.#headers.delete("Authorization");
  }

  #makeParams<P>(params: P, secureParams: boolean) {
    const toParse = { ...this.#params, ...params };
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

      if (isUnique || isObject) {
        return [...acc, `${keyUrl}=${paramUrl}`];
      }

      return acc;
    }, [] as string[]).join("&");

    if (parsedParams.length > 0) {
      return `?${parsedParams}`;
    }

    return "";
  }

  // eslint-disable-next-line class-methods-use-this
  #makeBody<T>(body: T, contentType: ContentType = ContentType.ApplicationJson) {
    switch (contentType) {
      case ContentType.ApplicationFormData:
        const parsedBody = new FormData();
        const { files = [], file, ...addToFormData } = body as HTTPBodyFiles<T>;
        files.forEach((fileItem, index) => {
          parsedBody.append(`file${index}`, fileItem, fileItem.name);
        });

        if (file) parsedBody.append("file", file, file.name);

        Object.keys(addToFormData).forEach((key) => {
          parsedBody.append(key, addToFormData[key]);
        });
        return parsedBody;
      default:
        return JSON.stringify(body);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  #whatContentType(contentType: string) {
    if (contentType.includes(ContentType.ApplicationJson)) {
      return {
        json: true,
        file: false,
      };
    }

    const isFile = contentType.includes(ContentType.ApplicationOctetStream)
      || contentType.includes(ContentType.ApplicationZip)
      || contentType.includes(ContentType.ApplicationPdf);
    const isImage = contentType.includes(ContentType.ImageJpeg)
      || contentType.includes(ContentType.ImagePng)
      || contentType.includes(ContentType.ImageGif)
      || contentType.includes(ContentType.ImageWebp)
      || contentType.includes(ContentType.ImageSvgXml);
    const isAudio = contentType.includes(ContentType.AudioMpeg)
      || contentType.includes(ContentType.AudioOgg)
      || contentType.includes(ContentType.AudioWav);
    const isVideo = contentType.includes(ContentType.VideoMp4)
      || contentType.includes(ContentType.VideoWebm)
      || contentType.includes(ContentType.VideoOgg);

    if (isFile || isImage || isAudio || isVideo) {
      return {
        json: false,
        file: true,
      };
    }

    return {
      json: false,
      file: false,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  #log(httpLog: HTTPLog) {
    Object.keys(httpLog).forEach((key) => {
      const keyName = key as keyof HTTPLog;
      const value = httpLog[keyName];

      if (keyName === "request") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headers = Object.fromEntries(((value) as any).headers.entries());
        // eslint-disable-next-line no-console
        console.log(`%c${keyName}:`, "color: #00b894; font-weight: bold;", value);
        // eslint-disable-next-line no-console
        console.log("%cheaders:", "color: #00b894; font-weight: bold;", headers);
      } else {
        // eslint-disable-next-line no-console
        console.log(`%c${keyName === "url" ? "endpoint" : keyName}:`, "color: #00b894; font-weight: bold;", value);
      }
    });
  }

  public setAuth = (token: string) => {
    this.#headers.set("Authorization", `Bearer ${token}`);
  };

  public setLang = (lang: string) => {
    this.#headers.set("Accept-Language", lang);
  };
}
