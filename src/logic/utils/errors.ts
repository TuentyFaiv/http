/* eslint-disable max-classes-per-file */
import swal from "sweetalert";

import type { HttpConnectionError } from "../typing/classes/http";

export class CustomError extends Error {
  date: Date;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(name = "Error", ...params: any[]) {
    super(...params);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((Error as any).captureStackTrace) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Error as any).captureStackTrace(this, CustomError);
    }

    this.name = name;
    this.date = new Date();
  }
}

export class ServiceError extends Error {
  title: string;
  date: Date;
  #data: HttpConnectionError;

  constructor(
    data: HttpConnectionError,
    title = "!Connection Error¡",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...params: any[]
  ) {
    super(...params);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((Error as any).captureStackTrace) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Error as any).captureStackTrace(this, ServiceError);
    }

    this.name = "ServiceError";
    this.message = data.message;
    this.title = title;
    this.date = new Date();
    this.#data = data;
  }

  view = () => (this.#data);
}

export function throwError(error: unknown) {
  let message = "¡Oh no!";
  let name = "Error!";
  let title = "Ops!";
  if (error instanceof Error) {
    message = error.message;
    name = error.name;
  }
  if (error instanceof ServiceError) {
    message = error.view().message;
    name = error.name;
    title = error.title;
  }

  if (!name.includes("AbortError")) {
    swal({
      title,
      text: message,
      icon: "error",
      className: "error-alert",
      timer: 4000,
    });
  }

  if (error instanceof ServiceError) {
    return new ServiceError(error.view());
  }

  if (name.includes("AbortError")) {
    return new CustomError(name, message);
  }

  return new Error(message);
}
