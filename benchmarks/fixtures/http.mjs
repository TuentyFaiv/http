import { bare, Http } from "../../dist/index.js";

// Avoid the default exported instance cached under the empty base URL.
const client = Http.create("", { preset: bare, cache: false });
export const getJson = (url) => client.get(url);
