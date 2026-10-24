// biome-ignore-all lint/performance/noAwaitInLoops: ordered browser workflows validate actual user interactions
// biome-ignore-all lint/style/noMagicNumbers: explicit viewport, payload and timeout fixtures
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone executable smoke test uses node:assert
// biome-ignore-all lint/security/noSecrets: DOM selectors and synthetic fixtures contain no credentials
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const output = resolve(".temp/browser-smoke");
const MARKDOWN_EXTENSION = /\.mdx?$/;
const INDEX_SLUG = /\/?index$/;
const TABLE_SEPARATOR = /^\|(?:\s*:?-+:?\s*\|)+\s*$/gm;
const UNPUBLISHED_COPY = /Not published yet|Aún sin publicar|pending publication|pendiente de publicación/;
const readyRun = '[data-run][aria-disabled="false"]:enabled';
const demoPages = {
	json: "json",
	schema: "validation",
	hooks: "hooks",
	safe: "safe-errors",
	retry: "retries",
	timing: "timeout-cancellation",
	upload: "file-upload",
	confirmedUpload: "confirmed-upload",
	download: "download",
	stream: "streaming",
	multipart: "multipart",
	configure: "configuration",
	safeRequest: "safe-request",
	transform: "transforms",
};
function renderedTables(directory = resolve("docs/src/content/docs")) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return renderedTables(path);
		}
		if (!MARKDOWN_EXTENSION.test(entry.name)) {
			return [];
		}
		const source = readFileSync(path, "utf8");
		const count = [...source.matchAll(TABLE_SEPARATOR)].length;
		if (!count) {
			return [];
		}
		const slug = relative(resolve("docs/src/content/docs"), path)
			.replace(MARKDOWN_EXTENSION, "")
			.replace(INDEX_SLUG, "");
		return [{ slug, count, html: readFileSync(resolve("docs/dist/client", slug, "index.html"), "utf8") }];
	});
}
const tablePages = renderedTables();
let receiveChunk;
async function runExample(page) {
	// Observe the send before waiting for completion; an initially enabled button is not a completion signal.
	const panel = page.locator("[data-live-examples]:visible");
	const sent = page.waitForRequest((request) => request.url().includes("/api/examples/"));
	await panel.locator("[data-run]").click();
	await sent;
	await panel.locator(readyRun).waitFor({ state: "visible", timeout: 20_000 });
	return await panel.locator("[data-result]").innerText();
}
async function publicationChecks(page, label, locale) {
	if (label === "home") {
		assert(
			(await page.locator(".home-release").innerText()).includes(locale ? "Publicado en npm" : "Published on npm"),
			"Homepage confirms npm publication"
		);
	} else {
		const releaseLink = page.locator('.sl-markdown-content a[href="https://www.npmjs.com/package/fetchzen/v/0.2.0"]');
		assert.equal(await releaseLink.count(), 1, "Getting started links to the published npm version");
		assert(
			(await releaseLink.locator("xpath=ancestor::p").innerText()).includes(
				locale ? "publicado en npm" : "published on npm"
			),
			"Getting started confirms npm publication"
		);
	}
	assert.doesNotMatch(
		await page.locator("main").innerText(),
		UNPUBLISHED_COPY,
		"Installation copy must reflect the published release in both locales"
	);
}
async function brandChecks(page, base, engine, locale) {
	const language = locale ? "es" : "en";
	for (const [slug, label] of [
		[locale, "home"],
		[`${locale}getting-started/`, "docs"],
	]) {
		await page.goto(`${base}/${slug}`);
		await publicationChecks(page, label, locale);
		await page.evaluate(async () => {
			await document.fonts.ready;
		});
		// External code CSS can trigger a font load after the initial FontFaceSet promise.
		await page.waitForFunction(() => {
			const loaded = [...document.fonts].filter((face) => face.status === "loaded");
			return ["Caveat", "Source Sans", "IBM Plex Mono"].every((family) =>
				loaded.some((face) => face.family.includes(family))
			);
		});
		const faces = await page.evaluate(() =>
			[...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family)
		);
		assert(
			faces.some((face) => face.includes("Caveat")),
			"Display font must load"
		);
		assert(
			faces.some((face) => face.includes("Source Sans")),
			"Reading font must load"
		);
		assert(await page.locator(".http-brand__symbol path").getAttribute("d"), "Original Open f must render");
		assert(
			faces.some((face) => face.includes("IBM Plex Mono")),
			"Code font must load"
		);
		await page.keyboard.press("Tab");
		assert.equal(
			await page.evaluate(() => {
				const focused = document.activeElement;
				const rect = focused?.getBoundingClientRect();
				return Boolean(focused?.closest("header.header") && rect.width > 0 && rect.height > 0);
			}),
			true,
			"Keyboard navigation starts at a visible header control, respecting the browser's link-tabbing preference"
		);
		await page.evaluate(() => document.activeElement?.blur());
		for (const width of [320, 1280, 1920]) {
			await page.setViewportSize({ width, height: 900 });
			for (const theme of ["light", "dark"]) {
				await page.evaluate((value) => {
					document.documentElement.dataset.theme = value;
				}, theme);
				assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no overflow`);
				const codeFits = await page
					.locator(".expressive-code pre:visible")
					.evaluateAll((blocks) =>
						blocks.every((block) => getComputedStyle(block.querySelector("code")).paddingInlineEnd === "0px")
					);
				assert(codeFits, `${label}: copy clearance does not add padding to the full-width flex code child`);
				const install = page.locator(".install-command .frame:visible");
				assert.equal(
					await install.evaluate((frame) => {
						const pre = frame.querySelector("pre").getBoundingClientRect();
						const copy = frame.querySelector(".copy button").getBoundingClientRect();
						return pre.right <= copy.left && copy.right <= frame.getBoundingClientRect().right;
					}),
					true,
					`${label}: install command has a separate copy rail`
				);
				if (label === "home") {
					assert.equal(await page.locator('.home-footer a[href$="fonts-license.txt"]').count(), 0);
					assert.equal(
						await page.locator(".home-editor pre:visible").evaluate((pre) => getComputedStyle(pre).borderTopWidth),
						"0px",
						"Hero code has no nested panel border"
					);
					assert.equal(
						await page.locator(".home-hero .home-button").evaluate((button) => getComputedStyle(button).borderRadius),
						"6px"
					);
				} else {
					assert.equal(
						await page
							.locator(".content-panel")
							.nth(1)
							.evaluate((panel) => getComputedStyle(panel).borderTopWidth),
						"0px",
						"No viewport-wide title divider behind the rails"
					);
					assert.equal(
						await page
							.locator(".content-panel > .sl-container")
							.nth(1)
							.evaluate((column) => {
								const title = document.getElementById("_top").getBoundingClientRect();
								const line = column.getBoundingClientRect();
								return (
									getComputedStyle(column).borderTopWidth === "1px" &&
									line.left >= title.left - 1 &&
									line.right <= title.right + 1
								);
							}),
						true,
						"Title divider stays inside the reading column"
					);
				}
				await page.screenshot({
					path: resolve(output, `brand-${engine}-${label}-${language}-${width}-${theme}.png`),
				});
			}
		}
	}
	await page.setViewportSize({ width: 375, height: 900 });
	const menu = page.locator(".sl-menu-button");
	await menu.focus();
	await menu.press("Enter");
	await page.locator(".sidebar-pane").waitFor({ state: "visible" });
	assert.equal(await page.locator('.sidebar-pane a[aria-current="page"]').count(), 1);
	const bypass = page.locator("[data-content-link]");
	await bypass.focus();
	await bypass.press("Enter");
	await page.locator(".sidebar-pane").waitFor({ state: "hidden" });
	assert.equal(
		await page.evaluate(() => document.activeElement?.id),
		"_top",
		"Visible sidebar bypass focuses the title"
	);

	// The site's overlay breakpoint is wider than Starlight's default 50rem.
	for (const width of [800, 1280, 1791]) {
		await page.setViewportSize({ width, height: 900 });
		await menu.click();
		await page.locator("#starlight__sidebar:popover-open").waitFor({ state: "visible" });
		assert.equal(await page.locator(".main-frame").evaluate((frame) => frame.inert), true);
		await page.keyboard.press("Escape");
		await page.locator(".sidebar-pane").waitFor({ state: "hidden" });
		assert.equal(await page.locator(".main-frame").evaluate((frame) => frame.inert), false);
	}
	await page.setViewportSize({ width: 1920, height: 900 });
	await page.locator(".sidebar-pane").waitFor({ state: "visible" });
	assert.equal(await page.locator(".sidebar-pane").getAttribute("popover"), null);
	assert.equal(await menu.isVisible(), false);

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.locator(".sidebar-pane").waitFor({ state: "hidden" });
	assert(
		await page
			.locator('.social-icons a[href^="https://github.com/"] > svg')
			.first()
			.evaluate((icon) => getComputedStyle(icon).maskImage.includes("github")),
		"Header GitHub link uses the shared hand-drawn GitHub artwork"
	);
	await page.locator("site-search button").first().click();
	const dialog = page.locator("dialog[open]");
	await dialog.waitFor();
	await dialog.locator(".pagefind-ui__search-input").fill("presets");
	await dialog.locator(".pagefind-ui__result-link").first().waitFor();
	await page.keyboard.press("Escape");
	await dialog.waitFor({ state: "hidden" });

	await page.goto(`${base}/${locale}`);
	const editorTabs = page.locator(".home-editor");
	await editorTabs.getByRole("tab").nth(1).focus();
	await page.keyboard.press("ArrowRight");
	assert.equal(await editorTabs.getByRole("tab").nth(2).getAttribute("aria-selected"), "true");
	const install = page.locator(".home-install");
	await install.getByRole("tab", { name: "npm", exact: true }).click();
	// Test the real copy control without changing the user's operating-system clipboard.
	await page.evaluate(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: (text) => {
					globalThis.__brandCopied = text;
					return Promise.resolve();
				},
			},
		});
	});
	await install.getByRole("tabpanel").filter({ visible: true }).hover();
	await install.getByRole("tabpanel").filter({ visible: true }).getByRole("button").click();
	assert.equal(await page.evaluate(() => globalThis.__brandCopied), "npm install fetchzen");
	await page.emulateMedia({ reducedMotion: "reduce" });
	assert.equal(await page.locator(".home-features").isVisible(), true);
	await page.emulateMedia({ reducedMotion: "no-preference" });
}
async function confirmedUploadChecks(page, receiptBase) {
	const panel = page.locator("[data-live-examples]:visible");
	// First exercise the unmodified native Fetch -> production Worker path.
	await panel.locator('select[name="confirmedSize"]').selectOption("600000");
	assert.deepEqual(JSON.parse(await runExample(page)), {
		receivedBytes: 600_000,
		total: 600_000,
		chunks: 3,
		stored: false,
	});
	// Route only the URL to a local receipt fixture. Do not replay/intercept Blob bodies:
	// WebKit's automation protocol does not expose them to route.fetch().
	await page.evaluate((base) => {
		const original = globalThis.fetch;
		globalThis.__confirmedNativeFetch = original;
		globalThis.fetch = (input, init) =>
			original(
				String(input).endsWith("/api/examples/upload-chunk/") ? `${base}/api/examples/upload-chunk/` : input,
				init
			);
	}, receiptBase);
	const exercise = async (cancel) => {
		const releases = [];
		const gates = [0, 1].map(() => new Promise((resolve) => releases.push(resolve)));
		const receipts = [];
		await page.evaluate(() => {
			globalThis.__confirmedRequests = 0;
		});
		receiveChunk = async (bytes) => {
			const index = receipts.push(bytes) - 1;
			await page.evaluate((count) => {
				globalThis.__confirmedRequests = count;
			}, receipts.length);
			if (index < gates.length) {
				await gates[index];
			}
			return { receivedBytes: bytes, stored: false };
		};
		try {
			await panel.locator('select[name="confirmedSize"]').selectOption("600000");
			await panel.locator("[data-run]").click();
			await page.waitForFunction(() => globalThis.__confirmedRequests === 1);
			assert.equal(await panel.locator("progress").getAttribute("value"), "0");
			assert.equal(await panel.locator("[data-run]").getAttribute("aria-disabled"), "true");
			assert.equal(
				await panel.locator("[data-run]").evaluate((button) => button.disabled),
				false,
				"Run keeps its native focusability while aria-disabled prevents repeat submission"
			);
			assert.deepEqual(receipts, [262_144]);
			releases[0]();
			await page.waitForFunction(() => globalThis.__confirmedRequests === 2);
			assert.equal(await panel.locator("progress").getAttribute("value"), "262144");
			assert.deepEqual(receipts, [262_144, 262_144]);
			if (cancel) {
				await panel.locator("[data-cancel]").click();
				await panel.locator(readyRun).waitFor();
				assert.equal(await panel.locator("[data-progress-area]").isVisible(), false);
				return;
			}
			releases[1]();
			await panel.locator(readyRun).waitFor();
			assert.deepEqual(receipts, [262_144, 262_144, 75_712]);
			const result = await panel.locator("[data-result]").innerText();
			assert.deepEqual(JSON.parse(result), { receivedBytes: 600_000, total: 600_000, chunks: 3, stored: false });
			assert.equal(await panel.locator("progress").getAttribute("value"), "600000");
			assert.equal(await panel.locator("[data-progress-area]").isVisible(), true);
			return result;
		} finally {
			for (const release of releases) {
				release();
			}
			receiveChunk = undefined;
		}
	};
	assert.equal(
		await panel.locator('input[type="file"]').count(),
		0,
		"Confirmed demo must generate data, not upload personal files"
	);
	const result = await exercise(false);
	await panel.locator('select[name="confirmedSize"]').selectOption("0");
	assert.deepEqual(JSON.parse(await runExample(page)), { receivedBytes: 0, total: 0, chunks: 1, stored: false });
	assert.equal(await panel.locator("progress").getAttribute("value"), "1");
	let invalidRequests = 0;
	receiveChunk = () => {
		invalidRequests += 1;
		return { receivedBytes: 1 };
	};
	try {
		await panel.locator('select[name="confirmedSize"]').selectOption("600000");
		assert((await runExample(page)).includes("must equal the chunk size"));
		assert.equal(invalidRequests, 1);
		assert.equal(await panel.locator("[data-progress-area]").isVisible(), false);
	} finally {
		receiveChunk = undefined;
	}
	await exercise(true);
	await page.evaluate(() => {
		globalThis.fetch = globalThis.__confirmedNativeFetch;
		globalThis.__confirmedNativeFetch = undefined;
	});
	return result;
}
mkdirSync(output, { recursive: true });
if (!process.env.PLAYWRIGHT_MODULE) {
	throw new Error("Set PLAYWRIGHT_MODULE to an installed Playwright module; install its browsers before running.");
}
const playwright = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const requireDocs = createRequire(resolve("docs/package.json"));
const { unstable_dev } = requireDocs("wrangler");
writeFileSync(
	resolve(output, "progress.mjs"),
	`import { withProgress } from ${JSON.stringify(resolve("dist/helpers.js"))}; globalThis.__fetchzenProgress = withProgress;`
);
const build = spawnSync(
	"bun",
	["build", resolve(output, "progress.mjs"), "--target=browser", "--minify", `--outdir=${output}`],
	{
		cwd: root,
		stdio: "inherit",
	}
);
if (build.status !== 0) {
	throw new Error("Browser fixture build failed");
}
const injection = readFileSync(resolve(output, "progress.js"), "utf8");
const decoded = Buffer.alloc(65_536, "x");
const encoded = gzipSync(decoded);
const cors = createServer((request, response) => {
	if (request.url === "/api/examples/upload-chunk/") {
		const headers = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		};
		if (request.method === "OPTIONS") {
			response.writeHead(204, headers).end();
			return;
		}
		const read = async () => {
			let bytes = 0;
			for await (const chunk of request) {
				bytes += chunk.length;
				if (bytes > 262_144) {
					throw new RangeError("Receipt fixture chunk limit exceeded");
				}
			}
			const receipt = receiveChunk ? await receiveChunk(bytes) : { receivedBytes: bytes, stored: false };
			if (!response.destroyed) {
				response.writeHead(200, headers).end(JSON.stringify({ data: receipt }));
			}
		};
		read().catch((error) => {
			if (!response.destroyed) {
				response.writeHead(500, headers).end(JSON.stringify({ error: error.message }));
			}
		});
		return;
	}
	const identity = request.url === "/identity";
	response.writeHead(200, {
		"Access-Control-Allow-Origin": "*",
		"Content-Type": "text/plain",
		"Content-Encoding": identity ? "identity" : "gzip",
		"Content-Length": String(identity ? decoded.length : encoded.length),
		...(identity ? { "Access-Control-Expose-Headers": "Content-Encoding" } : {}),
	});
	response.end(identity ? decoded : encoded);
});
cors.listen(0, "127.0.0.1");
await once(cors, "listening");
const address = cors.address();
const corsBase = `http://127.0.0.1:${address.port}`;
let worker;
try {
	worker = await unstable_dev("docs/dist/server/entry.mjs", {
		config: "docs/dist/server/wrangler.json",
		local: true,
		port: 0,
		inspectorPort: 0,
		logLevel: "error",
		experimental: { disableExperimentalWarning: true, watch: false },
	});
	const base = `http://${worker.address}:${worker.port}`;
	for (const name of (process.env.BROWSERS ?? "chromium,firefox,webkit").split(",")) {
		const browser = await playwright[name].launch({ timeout: 30_000 });
		try {
			const context = await browser.newContext({ acceptDownloads: true });
			const page = await context.newPage();
			const errors = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.goto(`${base}/`);
			assert.equal(await page.locator("header.header").getByRole("link", { name: "FetchZen", exact: true }).count(), 1);
			assert((await page.locator(".home-install").innerText()).includes("bun add fetchzen"));
			assert((await page.locator(".home-release").innerText()).includes("0.2.0"));
			assert.equal(await page.locator('a[href="https://www.npmjs.com/package/fetchzen"]').count(), 1);
			await page.goto(`${base}/examples/live/`);
			for (const { slug, count, html } of tablePages) {
				const tables = await page.evaluate((markup) => {
					const document = new DOMParser().parseFromString(markup, "text/html");
					return [...document.querySelectorAll("table")].map((table) =>
						[...table.rows].map((row) => [...row.cells].reduce((total, cell) => total + cell.colSpan, 0))
					);
				}, html);
				assert(tables.length >= count, `${slug}: Markdown tables must render as tables`);
				for (const rows of tables) {
					assert(
						rows.every((columns) => columns === rows[0]),
						`${slug}: table columns must stay aligned`
					);
				}
			}
			for (const locale of ["", "es-mx/"]) {
				await brandChecks(page, base, name, locale);
				await page.goto(`${base}/${locale}examples/live/`);
				assert.equal(await page.locator("[data-live-examples]").count(), 0, "Overview must not mount a console");
				const sidebarHomes = await page
					.locator(".sidebar-pane a")
					.evaluateAll(
						(items) => items.filter((item) => ["/", "/es-mx/"].includes(new URL(item.href).pathname)).length
					);
				assert.equal(sidebarHomes, 0, "Sidebar must not repeat the homepage as Introduction");
				const links = await page
					.locator(".sl-markdown-content a")
					.evaluateAll((items) => items.map((item) => item.href));
				for (const slug of Object.values(demoPages)) {
					assert(links.includes(`${base}/${locale}examples/${slug}/`), `Overview must link ${slug}`);
				}
				for (const [scenario, slug] of Object.entries(demoPages)) {
					let initialRequests = 0;
					const eagerValidators = [];
					const record = (request) => {
						if (request.url().includes("/api/examples/")) {
							initialRequests += 1;
						}
						if (request.url().includes("demo-zod") || request.url().includes("demo-valibot")) {
							eagerValidators.push(request.url());
						}
					};
					page.on("request", record);
					await page.goto(`${base}/${locale}examples/${slug}/`);
					await page.waitForFunction(() => !document.querySelector("[data-run]").disabled);
					assert.equal(
						await page
							.locator("style")
							.evaluateAll((styles) => styles.filter((style) => style.hasAttribute("set:html")).length),
						0,
						"MDX must compile inline style directives instead of emitting empty styles with literal set:html attributes"
					);
					assert.equal(initialRequests, 0, "Examples must not request on load");
					assert.deepEqual(eagerValidators, [], "Validator libraries must wait until Run");
					page.off("request", record);
					const hasValidators = scenario === "schema" || scenario === "transform";
					const panel = page.locator("[data-live-examples]:visible");
					assert.equal(await page.locator("[data-live-examples]").count(), hasValidators ? 2 : 1);
					assert.equal(await panel.getAttribute("data-scenario"), scenario);
					assert.equal(await page.locator('select[name="scenario"]').count(), 0);
					if (scenario === "safe" || scenario === "safeRequest") {
						assert.equal(await page.locator('[name="preset"]').inputValue(), "problem");
					}
					if (scenario === "upload" || scenario === "multipart") {
						await page.locator('input[name="file"]').setInputFiles({
							name: "synthetic.txt",
							mimeType: "text/plain",
							buffer: Buffer.from("synthetic data"),
						});
					}
					const result =
						scenario === "confirmedUpload" ? await confirmedUploadChecks(page, corsBase) : await runExample(page);
					assert(result.length > 0, `${scenario} must show a result`);
					if (scenario === "multipart") {
						assert(result.includes("fileBytes"), result);
					}
					if (scenario === "configure") {
						assert(result.includes('"name": "Ada"'), result);
					}
					if (scenario === "safeRequest") {
						assert(result.includes('"status": 422'), result);
					}
					if (scenario === "safe") {
						assert(result.includes('"status": 422'), result);
					}
					if (scenario === "retry") {
						assert(result.includes('"attempt": 3'), result);
					}
					if (scenario === "json") {
						assert.equal(await page.locator("[data-json-body]").isVisible(), false);
						await page.locator('select[name="method"]').selectOption("POST");
						assert.equal(await page.locator("[data-json-name]").isVisible(), false);
						await page.locator('textarea[name="body"]').fill('{"name":"Grace"}');
						assert((await runExample(page)).includes('"name": "Grace"'));
					}
					if (scenario === "schema") {
						await panel.locator('input[name="invalid"]').check();
						assert.equal(JSON.parse(await runExample(page)).code, "ERR_SCHEMA");
					}
					if (scenario === "transform") {
						assert(result.includes('"greeting": "Hello, Ada"'), result);
					}
					if (hasValidators) {
						for (const provider of ["Zod", "Valibot"]) {
							await page.getByRole("tab", { name: provider, exact: true }).click();
							assert.equal(await panel.getAttribute("data-validator"), provider.toLowerCase());
							if (scenario === "schema") {
								await panel.locator('input[name="invalid"]').uncheck();
							}
							await panel.locator('input[name="name"]').fill(" Grace ");
							const output = JSON.parse(await runExample(page)).payload;
							assert.deepEqual(
								output,
								scenario === "schema" ? { name: "Grace" } : { greeting: "Hello, Grace", characters: 5 }
							);
							if (scenario === "schema") {
								await panel.locator('input[name="invalid"]').check();
								assert.equal(JSON.parse(await runExample(page)).code, "ERR_SCHEMA");
							}
						}
					}
					if (scenario === "stream") {
						const records = JSON.parse(result);
						assert.equal(records.length, 6, await page.locator("[data-log]").innerText());
						assert.equal(records.at(-1).index, 5);
					}
					if (scenario === "download") {
						await page.evaluate(() => {
							const urls = { created: [], revoked: [] };
							globalThis.__downloadUrls = urls;
							const create = URL.createObjectURL.bind(URL);
							const revoke = URL.revokeObjectURL.bind(URL);
							URL.createObjectURL = (blob) => {
								const url = create(blob);
								urls.created.push(url);
								return url;
							};
							URL.revokeObjectURL = (url) => {
								urls.revoked.push(url);
								revoke(url);
							};
						});
						const [file] = await Promise.all([page.waitForEvent("download"), page.locator("[data-save]").click()]);
						const path = resolve(output, `${name}-${locale ? "es" : "en"}-demo.bin`);
						await file.saveAs(path);
						assert.equal(statSync(path).size, 262_144);
						const firstUrl = await page.evaluate(() => globalThis.__downloadUrls.created[0]);
						assert(firstUrl);
						await Promise.all([page.waitForEvent("download"), page.locator("[data-save]").click()]);
						assert.deepEqual(await page.evaluate(() => globalThis.__downloadUrls), {
							created: [firstUrl],
							revoked: [],
						});
						assert.equal(await page.locator("[data-progress-area]").isVisible(), true);
						await page.locator('input[name="known"]').uncheck();
						await runExample(page);
						assert.deepEqual(await page.evaluate(() => globalThis.__downloadUrls.revoked), [firstUrl]);
						assert.equal(await page.locator("progress").getAttribute("value"), null);
					}
					for (const width of [375, 1280]) {
						await page.setViewportSize({ width, height: 900 });
						for (const theme of ["light", "dark"]) {
							await page.evaluate((value) => {
								document.documentElement.dataset.theme = value;
							}, theme);
							assert(
								await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
								`${slug}: no page overflow`
							);
							if (scenario === "download" && theme === "light") {
								await page.screenshot({
									path: resolve(output, `${name}-${locale ? "es" : "en"}-${width}.png`),
									fullPage: true,
								});
							}
						}
					}
				}
				await page.goto(`${base}/${locale}examples/timeout-cancellation/`);
				await page.locator(readyRun).waitFor();
				await page.locator('input[name="delay"]').fill("3000");
				await page.locator('input[name="deadline"]').fill("10000");
				await page.locator("[data-run]").click();
				await page.locator("[data-cancel]").click();
				await page.locator(readyRun).waitFor();
			}
			await page.addScriptTag({ content: injection });
			for (const path of ["/hidden", "/identity"]) {
				const result = await page.evaluate(async (url) => {
					const original = await fetch(url);
					const events = [];
					const wrapped = globalThis.__fetchzenProgress(original, (event) => events.push(event));
					const clone = wrapped.clone();
					await Promise.all([wrapped.arrayBuffer(), clone.arrayBuffer()]);
					return {
						encoding: original.headers.get("Content-Encoding"),
						type: wrapped.type,
						url: wrapped.url,
						cloneUrl: clone.url,
						event: events.at(-1),
					};
				}, `${corsBase}${path}`);
				assert.equal(result.encoding, path === "/identity" ? "identity" : null);
				assert.equal(result.type, "cors");
				assert.equal(result.url, result.cloneUrl);
				assert.equal(result.event.loaded, decoded.length);
				assert.equal(result.event.done, true);
				assert.equal(result.event.total, path === "/identity" ? decoded.length : undefined);
				assert.equal(result.event.percent, path === "/identity" ? 100 : undefined);
			}
			assert.deepEqual(errors, []);
			process.stdout.write(
				`${name}: ${Object.keys(demoPages).length} focused pages in both locales, receipts, tables, saves, cancellation, responsive themes, CORS progress passed\n`
			);
			await context.close();
		} finally {
			await browser.close();
		}
	}
} finally {
	try {
		await worker?.stop();
	} finally {
		cors.closeAllConnections();
		await new Promise((done) => cors.close(done));
	}
}
