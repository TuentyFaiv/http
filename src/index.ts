import { instance } from "./logic/functions/instance.js";

export { HttpInstance as Http } from "./logic/classes/http.js";
export { ServiceError, CustomError } from "./logic/classes/errors.js";
export { throwError } from "./logic/functions/throw.js";
export { ContentType } from "./logic/typing/enums/content.js";

export type {
  HttpConfigInitial,
  HttpAlert,
  HttpAlertConfig,
  HttpStorage,
  HttpStorageAsync,
} from "./logic/typing/classes/http.typing.js";

export default instance;
