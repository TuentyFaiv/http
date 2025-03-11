import { HttpInstance as Http } from "../classes/http.js";

export const instance = Http.create("no-api", {
  secure: false,
});
