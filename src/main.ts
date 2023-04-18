import http, { Http, ServiceError } from "./index";

const RickAndMortyAPI = Http.create("https://rickandmortyapi.com/api");

RickAndMortyAPI.get("/character", { log: true }).then((response) => {
  console.table(response);
});

http.get("https://rickandmortyapi.com/api/a", { log: true }).then((response) => {
  console.table(response);
}).catch((error) => {
  if (error instanceof ServiceError) {
    console.error(error.view());
  }
});
