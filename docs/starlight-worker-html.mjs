import { fileURLToPath } from "node:url";

const htmlProcessor = /\/@astrojs\/starlight\/dist\/user-components\/(?:tabs|file-tree|steps)-processor\.js$/;
const portableParser = fileURLToPath(new URL("./src/server/starlight-html.mjs", import.meta.url));

/**
 * Starlight 0.42 imports Satteri's native HTML parser from SSR components.
 * Workerd cannot use its native bindings, and its browser fallback requires WASI.
 * Only bridge those HTML-fragment consumers; Astro's Markdown compiler stays native.
 * Remove this bridge when Starlight provides a Worker-compatible HTML parser.
 */
function starlightWorkerHtmlParser() {
	return {
		name: "fetchzen:starlight-worker-html-parser",
		enforce: "pre",
		resolveId(source, importer) {
			if (source === "satteri" && importer && htmlProcessor.test(importer.replaceAll("\\", "/"))) {
				return portableParser;
			}
		},
	};
}

export { starlightWorkerHtmlParser };
