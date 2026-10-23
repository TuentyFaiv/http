import { instance } from "./logic/functions/instance.js";

export type { HttpClient } from "./logic/classes/http.js";

export * from "./helpers.js";
export { HttpInstance as Http } from "./logic/classes/http.js";

export default instance;
