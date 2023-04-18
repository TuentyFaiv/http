import { CustomError, ServiceError } from "../classes/errors";

import type { HttpAlert } from "../typing/classes/http";

export function throwError(error: unknown, swal?: HttpAlert) {
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
    swal?.({
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
