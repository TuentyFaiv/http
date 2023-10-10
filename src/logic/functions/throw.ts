import { CustomError, ServiceError } from "../classes/errors";

import type { HttpAlert } from "../typing/classes/http.typing";

export function throwError(error: unknown, swal?: HttpAlert) {
  let message = "¡Oh no!";
  let name = "Error!";
  let title = "Ops!";
  let icon = "error";
  let time = 4000;
  if (error instanceof Error) {
    message = error.message;
    name = error.name;
  }
  if (error instanceof ServiceError) {
    const errorData = error.view();
    message = errorData.message;
    name = error.name;
    title = errorData.title;
    icon = errorData.icon;
    time = errorData.time;
  }

  if (!name.includes("AbortError")) {
    swal?.({
      title,
      text: message,
      icon,
      className: "http__error-alert",
      timer: time,
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
