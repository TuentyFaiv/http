/* eslint-disable max-classes-per-file */
import type { HttpConnectionError } from "../typing/classes/http.typing.js";

export class CustomError extends Error {
  date: Date;

  constructor(name = "Error", ...params: any[]) {
    super(...params);

    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, CustomError);
    }

    this.name = name;
    this.date = new Date();
  }
}

export class ServiceError extends Error {
  date: Date;
  #data: Required<HttpConnectionError>;

  constructor(
    {
      title = "!Connection Error¡",
      icon = "error",
      time = 4000,
      ...data
    }: HttpConnectionError,
    ...params: any[]
  ) {
    super(...params);

    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, ServiceError);
    }

    this.name = "ServiceError";
    this.message = data.message;
    this.date = new Date();
    this.#data = { ...data, title, icon, time };
  }

  view = () => (this.#data);
}
