import { HTTPContentType, HTTPMetod } from "../typing/classes/http";
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
import type { ObjStrCustom } from "../typing/globals/types";

export class Http implements HTTPContract {
  #api: string;
  #headers: Required<Required<HTTPConfigInitial>["headers"]>;
  #params: Required<HTTPConfigInitial>["params"];

  static instance: ObjStrCustom<Http> = {};

  private constructor(api: string, config?: HTTPConfigInitial) {
    const token = localStorage.getItem("sessionId") ?? "";

    this.#api = api;
    this.#headers = {
      "Content-Type": HTTPContentType.JSON,
      Authorization: token,
      "Accept-Language": "",
      ...config?.headers,
    };
    this.#params = config?.params ?? {};

    Object.freeze(this);
  }

  static create(api: string, config?: HTTPConfigInitial) {
    if (!Http.instance[api]) {
      Http.instance[api] = new Http(api, config);
    }

    return Http.instance[api];
  }

  async #connection<T, R, P>(config: HTTPConfigConnection<T, P>): Promise<HTTPConnectionReturn<R>> {
    try {
      const contentType = config.contentType ?? this.#headers["Content-Type"];
      const lang = config.lang ?? this.#headers["Accept-Language"];

      const body = this.#makebody(config.body, config.contentType);

      const requestConfig: HTTPConfigRequest = {
        method: config.method,
        headers: {
          ...((
            contentType !== HTTPContentType.FILES
            && contentType !== HTTPContentType.DOWNLOAD
            && config.method !== HTTPMetod.GET
          ) ? { "Content-Type": contentType } : {}),
          ...(config.secure ? {
            Authorization: `Bearer ${this.#headers.Authorization}`,
          } : {}),
        },
        ...(config.method === HTTPMetod.GET ? {} : {
          body,
        }),
        ...(config.signal ? { signal: config.signal } : {}),
        ...(config.lang ? { "Accept-Language": lang } : {}),
      };

      const params = this.#makeParams(config.params);
      const url = `${this.#api}${config.endpoint}${params}`;

      if (config.log) this.#log({ url, request: requestConfig });

      const request = await fetch(url, requestConfig);

      switch (contentType) {
        case HTTPContentType.DOWNLOAD:
          if (request.status !== 200) {

            const responseNone = await request.json();

            if (config.log) this.#log({ response: responseNone });
            if ((responseNone.error && !responseNone.result) || responseNone.errors || request.status !== 200) {
              throw new ServiceError({
                message: config.errorMessage ?? responseNone?.error ?? responseNone.message,
                code: responseNone?.error ?? responseNone?.code ?? "",
                status: responseNone?.result ?? responseNone?.status ?? "",
                errors: responseNone?.error ?? responseNone.errors ?? "",
              });
            }
          }

          return {
            success: true,
            message: "Success to download",
            payload: await request.blob() as R,
          };
        default:
          const response = await request.json();

          if (config.log) this.#log({ response });
          if ((response.error && !response.result) || response.errors || request.status !== 200) {
            throw new ServiceError({
              message: config.errorMessage ?? response?.error ?? response.message,
              code: response?.error ?? response?.code ?? "",
              status: response?.result ?? response?.status ?? "",
              errors: response?.error ?? response.errors ?? "",
            });
          }

          return {
            success: !!response?.result ?? response?.success,
            message: response?.error ?? response?.message ?? "",
            payload: response?.data ?? response?.payload,
          };
      }
    } catch (error) {
      throw throwError(error);
    }
  }

  #makeParams<P>(params: P) {
    const toParse = { ...this.#params, ...params };
    const parsedParams = Object.keys(toParse).reduce((acc, key) => {
      const isUnique = (
        typeof toParse[key] === "string"
        || typeof toParse[key] === "number"
        || typeof toParse[key] === "boolean"
        || typeof toParse[key] === "bigint"
      );

      const isObject = Array.isArray(toParse[key]) || typeof toParse[key] === "object";

      if (isUnique) {
        return [...acc, `${key}=${toParse[key]}`];
      }

      if (isObject) {
        const parsedObj = JSON.stringify(toParse[key]);
        return [...acc, `${key}=${parsedObj}`];
      }

      return acc;

    }, [] as string[]).join("&");

    if (parsedParams.length > 0) {
      return `?${parsedParams}`;
    }

    return "";
  }

  // eslint-disable-next-line class-methods-use-this
  #makebody<T>(body: T, contentType: HTTPContentType = HTTPContentType.JSON) {
    switch (contentType) {
      case HTTPContentType.FILES:
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

  #log(httpLog: HTTPLog) {
    // eslint-disable-next-line no-console
    console.log({
      ...httpLog,
      api: this.#api,
    });
  }

  public setAuth = (token: string) => {
    this.#headers.Authorization = token;
  };

  public setLang = (lang: string) => {
    const language = lang.split("-")[0];
    this.#headers["Accept-Language"] = language;
  };

  public async get<R, P = undefined>(endpoint: string, { secure = true, ...config }: HTTPConfigGet<P> = {}) {

    return this.#connection<never, R, P>({
      method: HTTPMetod.GET,
      secure,
      endpoint,
      ...config,
    });
  }

  public async put<T, R, P = undefined>(endpoint: string, body: T, { secure = true, ...config }: HTTPConfigMethod<T, P> = {}) {

    return this.#connection<T, R, P>({
      method: HTTPMetod.PUT,
      secure,
      endpoint,
      body,
      ...config,
    });
  }

  public async post<T, R, P = undefined>(endpoint: string, body: T, { secure = true, ...config }: HTTPConfigMethod<T, P> = {}) {

    return this.#connection<T, R, P>({
      method: HTTPMetod.POST,
      secure,
      endpoint,
      body,
      ...config,
    });
  }

  public async delete<T, R, P = undefined>(endpoint: string, body: T, { secure = true, ...config }: HTTPConfigMethod<T, P> = {}) {

    return this.#connection<T, R, P>({
      method: HTTPMetod.DELETE,
      secure,
      endpoint,
      body,
      ...config,
    });
  }
}
