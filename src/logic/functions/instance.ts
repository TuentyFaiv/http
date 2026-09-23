import { HttpInstance as Http } from "../classes/http.js";

export const instance = Http.create("", {
	secure: false,
});
