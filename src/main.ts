import { Http } from "./index";

const RickAndMortyAPI = Http.create("https://rickandmortyapi.com/api");

RickAndMortyAPI.get("/character", { log: true }).then((response) => {
  console.table(response);
});
