import { instance } from "./logic/functions/instance";

export { HttpInstance as Http } from "./logic/classes/http";
export { ServiceError, CustomError } from "./logic/classes/errors";
export { throwError } from "./logic/functions/throw";
export { ContentType } from "./logic/typing/enums/content";

export type {
  HttpConfigInitial,
  HttpAlert,
  HttpAlertConfig,
  HttpStorage,
  HttpStorageAsync,
} from "./logic/typing/classes/http";

export default instance;
