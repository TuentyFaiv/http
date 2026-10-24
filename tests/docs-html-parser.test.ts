import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const { starlightWorkerHtmlParser } = await import(new URL("../docs/starlight-worker-html.mjs", import.meta.url).href);
const portableParser = fileURLToPath(new URL("../docs/src/server/starlight-html.mjs", import.meta.url));

describe("Starlight Worker HTML compatibility", () => {
	it.each(["tabs", "file-tree", "steps"])("bridges only the %s HTML-fragment processor", (name) => {
		const plugin = starlightWorkerHtmlParser();
		expect(plugin.enforce).toBe("pre");
		expect(
			plugin.resolveId("satteri", `/repo/node_modules/@astrojs/starlight/dist/user-components/${name}-processor.js`)
		).toBe(portableParser);
	});

	it("supports Windows module paths", () => {
		expect(
			starlightWorkerHtmlParser().resolveId(
				"satteri",
				"C:\\repo\\node_modules\\@astrojs\\starlight\\dist\\user-components\\tabs-processor.js"
			)
		).toBe(portableParser);
	});

	it.each([
		undefined,
		"/repo/node_modules/@astrojs/markdown-satteri/dist/index.js",
		"/repo/node_modules/other-package/tabs-processor.js",
		"/repo/node_modules/@astrojs/starlight/dist/integrations/markdown.js",
	])("leaves the Markdown compiler and unrelated consumers unchanged (%s)", (importer) => {
		expect(starlightWorkerHtmlParser().resolveId("satteri", importer)).toBeUndefined();
	});

	it("leaves other imports from the same Starlight processor unchanged", () => {
		expect(
			starlightWorkerHtmlParser().resolveId(
				"hast-util-to-html",
				"/repo/node_modules/@astrojs/starlight/dist/user-components/tabs-processor.js"
			)
		).toBeUndefined();
	});

	it("preserves tab labels, entities, markup, and focusability attributes in HTML fragments", async () => {
		const { htmlToHast } = await import(new URL("../docs/src/server/starlight-html.mjs", import.meta.url).href);
		const tree = htmlToHast(
			'<starlight-tab-item data-label="Español &amp; English" data-icon="seti:javascript"><a href="/es-mx/">Guía &amp; API</a></starlight-tab-item>',
			{ fragment: true }
		);
		expect(tree.children).toHaveLength(1);
		expect(tree.children[0]).toMatchObject({
			type: "element",
			tagName: "starlight-tab-item",
			properties: { dataLabel: "Español & English", dataIcon: "seti:javascript" },
			children: [
				{
					type: "element",
					tagName: "a",
					properties: { href: "/es-mx/" },
					children: [{ type: "text", value: "Guía & API" }],
				},
			],
		});
	});
});
