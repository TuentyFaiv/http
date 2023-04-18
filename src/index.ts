import { instance } from "./logic/functions/instance";

export { HttpInstance as Http } from "./logic/classes";
export { throwError, ServiceError, CustomError } from "./logic/utils/errors";

export type {
  HTTPConfigInitial,
} from "./logic/typing/classes/http";

export type {
  ContentType,
} from "./logic/typing/enums";

export default instance;
