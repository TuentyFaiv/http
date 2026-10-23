// biome-ignore-all lint/performance/noAwaitInLoops: separate bundles make sizes independently verifiable
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = join(import.meta.dir, "..");
const output = join(import.meta.dir, "output");
const definitions = {
	normalizeError: "export { normalizeError };",
	buildUrl: "export { buildUrl };",
	signal: "export { composeSignal };",
};
const entries = { root: join(root, "dist/index.js"), helpers: join(root, "dist/helpers.js") };
const measurements = {};
await mkdir(output, { recursive: true });
for (const [entry, path] of Object.entries(entries)) {
	measurements[entry] = {};
	for (const [name, code] of Object.entries(definitions)) {
		const fixture = join(output, `helper-${entry}-${name}.mjs`);
		await Bun.write(
			fixture,
			`import { normalizeError, buildUrl, composeSignal } from ${JSON.stringify(path)};\n${code}\n`
		);
		const bundle = await Bun.build({
			entrypoints: [fixture],
			target: "browser",
			format: "esm",
			minify: true,
			sourcemap: "none",
		});
		if (!bundle.success || bundle.outputs.length !== 1) {
			throw new Error(`Helper bundle failed: ${entry}/${name}\n${bundle.logs.join("\n")}`);
		}
		const bytes = Buffer.from(await bundle.outputs[0].arrayBuffer());
		measurements[entry][name] = {
			bytes: bytes.length,
			gzipBytes: gzipSync(bytes, { level: 9 }).length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		};
		await Bun.write(join(output, `helper-${entry}-${name}.js`), bytes);
	}
}
const report = {
	measuredAt: new Date().toISOString(),
	runtime: { name: "Bun", version: Bun.version, revision: Bun.revision },
	methodology: "Separate minified browser ESM fixtures, gzip level 9. Wrapper bytes included; no network timing.",
	measurements,
};
await Bun.write(join(output, "helper-sizes.json"), `${JSON.stringify(report, null, "\t")}\n`);
process.stdout.write(
	`${Object.keys(definitions)
		.map(
			(name) =>
				`${name}: root ${measurements.root[name].gzipBytes} B -> helpers ${measurements.helpers[name].gzipBytes} B gzip`
		)
		.join("\n")}\n`
);
