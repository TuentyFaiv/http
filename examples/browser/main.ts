/**
 * Browser demo. Run with `bun run preview`.
 *
 * Exercises the pieces that only exist in a real browser: FormData uploads,
 * blob downloads, download progress and hooks.
 */
import http, { ContentType, Http, ServiceError } from "../../src/index.js";

const app = document.querySelector("#app");

function log(message: string) {
	const line = document.createElement("pre");

	line.textContent = message;
	app?.appendChild(line);
}

// A public api, using the default `envelope` preset.
const rickAndMorty = Http.create("https://rickandmortyapi.com/api");

// Attach a header to every request on the shared default instance.
http.hook("request", ({ url, init }) => {
	init.headers.set("X-Demo", "hooks");

	return { url, init };
});

async function listCharacters() {
	const [error, response] = await rickAndMorty.safe.get<{ results: { name: string }[] }, { page: number }>(
		"/character",
		{
			params: { page: 1 },
			timeout: 5000,
			retry: 2,
		}
	);

	if (error) {
		log(`failed: ${error.message}`);

		return;
	}

	log(`characters: ${response.payload.results.map((item) => item.name).join(", ")}`);
}

async function missingEndpoint() {
	try {
		await rickAndMorty.get("/nope");
	} catch (error) {
		if (error instanceof ServiceError) {
			log(`ServiceError ${error.status}: ${error.message}`);
		}
	}
}

function uploadForm() {
	const form = document.createElement("form");
	const input = document.createElement("input");
	const submit = document.createElement("button");
	const progress = document.createElement("progress");

	input.type = "file";
	input.name = "file";
	input.accept = "image/png, image/jpeg";
	submit.type = "submit";
	submit.textContent = "Convert to webp";
	progress.max = 100;
	progress.value = 0;

	form.append(input, submit, progress);
	app?.appendChild(form);

	// A local service that returns an image; see the docs for the server side.
	const converter = Http.create("http://localhost:5000");

	form.addEventListener("submit", async (event) => {
		event.preventDefault();

		const [error, response] = await converter.safe.post<FormData, Blob>("/transform", new FormData(form), {
			type: ContentType.APPLICATION_FORM_DATA,
			responseType: "blob",
			onDownloadProgress: ({ percent }) => {
				progress.value = percent ?? 0;
			},
		});

		if (error) {
			log(`upload failed: ${error.message}`);

			return;
		}

		const url = URL.createObjectURL(response.payload);
		const image = document.createElement("img");

		image.src = url;
		image.alt = "Converted image";
		app?.appendChild(image);
	});
}

await listCharacters();
await missingEndpoint();
uploadForm();
