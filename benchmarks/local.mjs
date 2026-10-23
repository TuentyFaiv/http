// biome-ignore-all lint/performance/noAwaitInLoops: paired sequential batches control comparison order
// biome-ignore-all lint/style/noMagicNumbers: explicit benchmark settings and unit conversions
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { cpus, platform } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const [beforePath, afterPath, destination = join(import.meta.dir, "output/local-comparison.json")] = Bun.argv.slice(2);
if (!(beforePath && afterPath)) {
	throw new Error("Usage: bun benchmarks/local.mjs BEFORE.mjs AFTER.mjs [RESULT.json]");
}

const output = join(import.meta.dir, "output");
const iterations = 1500;
const warmup = 500;
const samples = 10;
const url = "https://benchmark.invalid/items";
const payload = JSON.stringify({
	id: 42,
	title: "Local overhead comparison",
	tags: ["http", "json"],
	values: [1, 2, 3],
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sizes = (bytes) => ({
	bytes: bytes.length,
	gzipBytes: gzipSync(bytes, { level: 9 }).length,
	sha256: hash(bytes),
});
let calls = 0;
let checksum = 0;

function transport(input, init) {
	if (init?.method !== "GET" || !(input === url || input === `${url}?page=2`)) {
		throw new Error(`Unexpected request: ${init?.method} ${input}`);
	}
	if (input.endsWith("?page=2") && init.headers.get("X-Hook") !== "on") {
		throw new Error("Configured workload lost its request hook");
	}
	calls += 1;
	return Promise.resolve(new Response(payload, { headers: { "Content-Type": "application/json" } }));
}

const identity = (value) => value;
const envelopePayload = (value) => value.payload;
const safePayload = ({ data, error }) => {
	if (error) {
		throw error;
	}
	return data.payload;
};

function operations({ Http, bare }) {
	const config = { cache: false, fetch: transport, retry: 0, timeout: 0 };
	const raw = Http.create("", { ...config, preset: bare });
	const envelope = Http.create("", config);
	const defaultFetch = Http.create("", { cache: false, preset: bare });
	const configured = Http.create("https://benchmark.invalid", {
		...config,
		params: { page: 2 },
		headers: { accept: "application/json", "Accept-Language": "en", "X-Client": "local" },
		hooks: {
			request: [
				({ init }) => {
					init.headers.set("X-Hook", "on");
				},
			],
			response: [(response) => response],
		},
	});
	const schema = { "~standard": { version: 1, vendor: "benchmark", validate: (value) => ({ value }) } };
	const configuredOptions = { schema, headers: [["X-Request", "local"]] };
	const noClone = { clone: false };
	return [
		{ id: "bare", run: () => raw.get(url), project: identity },
		{ id: "envelope", run: () => envelope.get(url), project: envelopePayload },
		{ id: "safe-get", run: () => envelope.safe.get(url), project: safePayload },
		{ id: "safe-request", run: () => envelope.safe.request({ method: "GET", endpoint: url }), project: safePayload },
		{ id: "configured", run: () => configured.get("/items", configuredOptions), project: envelopePayload },
		{ id: "default-fetch", run: () => defaultFetch.get(url), project: identity },
		{ id: "no-clone", run: () => raw.get(url, noClone), project: identity },
	];
}

async function batch(operation, count) {
	const initial = calls;
	const started = performance.now();
	for (let index = 0; index < count; index += 1) {
		const value = operation.project(await operation.run());
		const serialized = JSON.stringify(value);
		if (serialized !== payload) {
			throw new Error(`Unexpected payload: ${operation.id}`);
		}
		checksum += serialized.length;
	}
	const elapsed = performance.now() - started;
	if (calls - initial !== count) {
		throw new Error(`Transport count mismatch: ${operation.id}`);
	}
	return (elapsed * 1000) / count;
}

function statistics(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return {
		medianUs: (sorted[samples / 2 - 1] + sorted[samples / 2]) / 2,
		minUs: sorted[0],
		maxUs: sorted.at(-1),
		samplesUs: values,
	};
}

async function browserSizes(path, variant) {
	const definitions = {
		bare: 'const api = Http.create("", { cache: false, preset: bare }); export const getJson = (url) => api.get(url);',
		envelope: 'const api = Http.create("", { cache: false }); export const getJson = (url) => api.get(url);',
		helper: "export { normalizeError };",
	};
	const result = {};
	for (const [name, code] of Object.entries(definitions)) {
		const entry = join(output, `local-${variant}-${name}.mjs`);
		await Bun.write(entry, `import { Http, bare, normalizeError } from ${JSON.stringify(resolve(path))};\n${code}\n`);
		const built = await Bun.build({
			entrypoints: [entry],
			target: "browser",
			format: "esm",
			minify: true,
			sourcemap: "none",
		});
		if (!built.success || built.outputs.length !== 1) {
			throw new Error(`Bundle failed: ${variant}/${name}\n${built.logs.join("\n")}`);
		}
		result[name] = sizes(Buffer.from(await built.outputs[0].arrayBuffer()));
	}
	return result;
}

await mkdir(output, { recursive: true });
const artifacts = {};
for (const [id, path] of [
	["before", beforePath],
	["after", afterPath],
]) {
	// Flatten the complete entry graph: packaged entries can import shared chunks.
	const built = await Bun.build({
		entrypoints: [resolve(path)],
		target: "browser",
		format: "esm",
		minify: true,
		sourcemap: "none",
	});
	if (!built.success || built.outputs.length !== 1) {
		throw new Error(`Runtime bundle failed: ${id}\n${built.logs.join("\n")}`);
	}
	const bytes = Buffer.from(await built.outputs[0].arrayBuffer());
	const runtimePath = join(output, `local-runtime-${id}.mjs`);
	await Bun.write(runtimePath, bytes);
	artifacts[id] = { path: resolve(path), runtimePath, ...sizes(bytes) };
}
const browser = { before: await browserSizes(beforePath, "before"), after: await browserSizes(afterPath, "after") };
const originalFetch = globalThis.fetch;
const timings = { before: [], after: [] };
const sampleOrder = [];
let workloads;
try {
	globalThis.fetch = () => {
		throw new Error("Network fetch forbidden during benchmark initialization");
	};
	const before = operations(await import(pathToFileURL(artifacts.before.runtimePath).href));
	const after = operations(await import(pathToFileURL(artifacts.after.runtimePath).href));
	workloads = { before, after };
	globalThis.fetch = transport;
	for (const id of ["before", "after"]) {
		for (const operation of workloads[id]) {
			await batch(operation, warmup);
			timings[id].push([]);
		}
	}
	for (let sample = 0; sample < samples; sample += 1) {
		const order = sample % 2 === 0 ? ["before", "after"] : ["after", "before"];
		sampleOrder.push(order);
		for (let offset = 0; offset < before.length; offset += 1) {
			const index = (sample + offset) % before.length;
			for (const id of order) {
				timings[id][index].push(await batch(workloads[id][index], iterations));
			}
		}
	}
} finally {
	globalThis.fetch = originalFetch;
}
const expectedCalls = 2 * workloads.before.length * (warmup + samples * iterations);
if (calls !== expectedCalls || checksum !== expectedCalls * payload.length) {
	throw new Error("Final benchmark validation failed");
}
const rows = workloads.before.map(({ id }, index) => {
	const before = statistics(timings.before[index]);
	const after = statistics(timings.after[index]);
	return { id, before, after, medianChangePercent: (after.medianUs / before.medianUs - 1) * 100 };
});
const report = {
	measuredAt: new Date().toISOString(),
	runtime: { name: "Bun", version: Bun.version, revision: Bun.revision },
	platform: platform(),
	cpu: cpus()[0]?.model,
	methodology: {
		iterations,
		warmup,
		samples,
		sampleOrder,
		payload,
		description:
			"Paired in-memory overhead; no network, default cloning retained except no-clone. Full value validation included. No forced GC or CPU/load control; sample means, not request percentiles.",
	},
	artifacts,
	browser,
	workloads: rows,
	validation: { calls, expectedCalls, checksum },
};
await Bun.write(destination, `${JSON.stringify(report, null, "\t")}\n`);
const messages = [
	`Full bundled entry gzip: ${artifacts.before.gzipBytes} -> ${artifacts.after.gzipBytes} B`,
	`Browser bare gzip: ${browser.before.bare.gzipBytes} -> ${browser.after.bare.gzipBytes} B`,
	`Browser helper gzip: ${browser.before.helper.gzipBytes} -> ${browser.after.helper.gzipBytes} B`,
];
for (const row of rows) {
	messages.push(
		`${row.id}: ${row.before.medianUs.toFixed(3)} -> ${row.after.medianUs.toFixed(3)} us/op (${row.medianChangePercent.toFixed(1)}%)`
	);
}
process.stdout.write(`${messages.join("\n")}\nWrote ${destination}\n`);
