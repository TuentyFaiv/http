import http, { ContentType, Http, ServiceError } from "./index.js";

// UI
const body = document.querySelector("body");
const section = document.createElement("section");
const h1 = document.createElement("h1");

const form = document.createElement("form");
const label = document.createElement("label");
const p = document.createElement("p");
const input = document.createElement("input");
const button = document.createElement("button");

const article = document.createElement("article");
const h2 = document.createElement("h2");
const img = document.createElement("img");

h1.textContent = "Convert to webp";

label.setAttribute("for", "file");
p.textContent = "Select a file";
input.setAttribute("type", "file");
input.setAttribute("name", "file");
input.setAttribute("accept", "image/png, image/jpeg");
input.setAttribute("required", "true");
button.setAttribute("type", "submit");
button.textContent = "Convert";

form.appendChild(label);
label.appendChild(p);
label.appendChild(input);
form.appendChild(button);

section.appendChild(h1);
section.appendChild(form);

article.appendChild(h2);
article.appendChild(img);

body?.appendChild(section);

// Logic

const API = Http.create("http://localhost:5000", {
  secure: false,
  log: true,
});

input.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    h2.textContent = file.name;
    img.setAttribute("src", URL.createObjectURL(file));
    img.setAttribute("alt", file.name);

    img.style.maxWidth = "200px";
    img.style.aspectRatio = "16 / 9";
    img.style.objectFit = "contain";

    body?.appendChild(article);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  console.log(Object.fromEntries((formData as any).entries()));

  const { payload } = await API.post<FormData, Blob>("/transform", formData, {
    type: ContentType.ApplicationFormData,
  });

  const url = URL.createObjectURL(payload);

  const image = document.createElement("img");
  const a = document.createElement("a");

  image.setAttribute("src", url);
  image.setAttribute("alt", "Converted image");

  a.setAttribute("href", url);
  a.setAttribute("download", "converted.webp");

  body?.appendChild(image);
  body?.appendChild(a);

  a.click();

  body?.appendChild(body);

  URL.revokeObjectURL(url);

  form.reset();
});

const RickAndMortyAPI = Http.create("https://rickandmortyapi.com/api", { log: true });

const StarWarsAPI = Http.create("https://swapi.dev/api");

// RickAndMortyAPI.

RickAndMortyAPI.global(async (config) => {
  console.log({ config });

  return {
    ...config,
    thrower: ({ json }) => {
      console.log({
        thrower: "(json?.info as { pages: number; }).pages === 42",
        json,
      });

      if ((json?.info as { pages: number; })?.pages === 42) {
        throw new ServiceError({
          status: 404,
          statusText: "Not Found",
          message: "The page you are looking for does not exist",
          errors: "The page you are looking for does not exist",
        });
      }
    },
  };
});

RickAndMortyAPI.get("/character").then((response) => {
  console.log(response);
}).catch((error) => {
  if (error instanceof ServiceError) {
    console.error(error.view());
  }
});

RickAndMortyAPI.get("/location", { log: false }).then((response) => {
  console.log(response);
});

StarWarsAPI.get("/people", { log: true }).then((response) => {
  console.log(response);
});

http.global(async ({ headers, params, ...config }) => {
  console.log({ headers, params });

  headers.set("X-Test-Global", "global header");

  return {
    ...config,
    headers,
    params,
  };
});

http.get("https://rickandmortyapi.com/api/a", {
  log: true,
  // headers: new Headers({
  //   "X-Test": "test",
  // })
}).then((response) => {
  console.log(response);
}).catch((error) => {
  if (error instanceof ServiceError) {
    console.error(error.view());
  }
});
