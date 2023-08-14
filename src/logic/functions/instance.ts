import { HttpInstance as Http } from "@classes/http";

export const instance = Http.create("no-api", {
  secure: false,
});
