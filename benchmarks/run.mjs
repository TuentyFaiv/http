// biome-ignore-all lint/performance/noAwaitInLoops: sequential requests and builds are deliberate benchmark controls
// biome-ignore-all lint/style/noMagicNumbers: explicit benchmark settings and unit conversions
import { createHash } from "node:crypto";
import { mkdir, readdir, rename } from "node:fs/promises";
import { arch, cpus, platform, release } from "node:os";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const directory = import.meta.dir;
const root = join(directory, "..");
const output = join(directory, "output");
const iterations = 2000;
const warmup = 500;
const samples = 9;
const ids = ["http", "axios", "fetch"];
const url = "https://benchmark.invalid/items";
const payload = JSON.stringify({
	id: 42,
	title: "In-memory HTTP comparison",
	active: true,
	tags: ["http", "json"],
	values: [1, 2, 3, 5, 8],
});
const payloadBytes = Buffer.byteLength(payload);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => Bun.file(path).json();

async function sourceFiles(path) {
	const entries = await readdir(path, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const child = join(path, entry.name);
		files.push(...(entry.isDirectory() ? await sourceFiles(child) : [child]));
	}
	return files;
}

async function sourceHash() {
	const files = [
		...(await sourceFiles(join(root, "src"))),
		...["package.json", "tsdown.config.ts", "tsconfig.json", "tsconfig.build.json", "bun.lock"].map((file) =>
			join(root, file)
		),
	].sort();
	const hash = createHash("sha256");
	for (const file of files) {
		hash.update(relative(root, file));
		hash.update("\0");
		hash.update(await Bun.file(file).bytes());
		hash.update("\0");
	}
	return { algorithm: "sha256", digest: hash.digest("hex"), files: files.map((file) => relative(root, file)) };
}

async function bundle(entry, name) {
	const result = await Bun.build({
		entrypoints: [join(directory, entry)],
		target: "browser",
		format: "esm",
		minify: true,
		sourcemap: "none",
		splitting: false,
	});
	if (!result.success || result.outputs.length !== 1) {
		throw new Error(`Browser bundle failed: ${name}\n${result.logs.join("\n")}`);
	}
	const bytes = Buffer.from(await result.outputs[0].arrayBuffer());
	await Bun.write(join(output, `${name}.js`), bytes);
	return { bundleBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, bundleSha256: sha256(bytes) };
}

await mkdir(output, { recursive: true });
const initialSource = await sourceHash();
const build = Bun.spawn([process.execPath, "run", "build"], { cwd: root, stdout: "inherit", stderr: "inherit" });
if ((await build.exited) !== 0) {
	throw new Error("Library build failed; no comparison data written");
}
const sizes = {};
for (const id of ids) {
	sizes[id] = await bundle(`fixtures/${id}.mjs`, id);
}
await bundle("clients.mjs", "clients");

// A mistaken fallback cannot make a real request, including during module initialization.
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
	throw new Error("Network fetch forbidden by comparison runner");
};
let calls = 0;
let checksum = 0;
const transport = (input, init) => {
	const target = input instanceof Request ? input.url : String(input);
	const method = init?.method ?? (input instanceof Request ? input.method : "GET");
	if (target !== url || method !== "GET") {
		throw new Error(`Unexpected transport request: ${method} ${target}`);
	}
	calls += 1;
	return Promise.resolve(
		new Response(payload, {
			status: 200,
			headers: { "content-type": "application/json", "content-length": String(payloadBytes) },
		})
	);
};

function consume(value) {
	const serialized = JSON.stringify(value);
	if (serialized !== payload) {
		throw new Error("Client returned a different or unparsed payload");
	}
	checksum += serialized.length;
}

async function batch(client, count) {
	const before = calls;
	const start = performance.now();
	for (let index = 0; index < count; index += 1) {
		consume(await client(url));
	}
	const elapsed = performance.now() - start;
	if (calls - before !== count) {
		throw new Error("Each GET must use the injected fetch exactly once");
	}
	return (elapsed * 1000) / count;
}

const timings = Object.fromEntries(ids.map((id) => [id, []]));
const sampleOrder = [];
try {
	const { createClients } = await import(join(output, "clients.js"));
	const clients = createClients(transport);
	for (const id of ids) {
		await batch(clients[id], warmup);
	}
	for (let sample = 0; sample < samples; sample += 1) {
		const order = ids.map((_, index) => ids[(index + sample) % ids.length]);
		sampleOrder.push(order);
		for (const id of order) {
			timings[id].push(await batch(clients[id], iterations));
		}
	}
} finally {
	globalThis.fetch = originalFetch;
}

const local = await json(join(root, "package.json"));
const manifests = {
	http: local,
	axios: await json(join(directory, "node_modules/axios/package.json")),

	fetch: { name: "Native fetch", version: `Bun ${Bun.version}`, dependencies: {} },
};
const pins = await json(join(directory, "package.json"));
for (const id of ["axios"]) {
	if (manifests[id].version !== pins.devDependencies[id]) {
		throw new Error(`Installed ${id} does not match the exact pin`);
	}
}
const finalSource = await sourceHash();
if (initialSource.digest !== finalSource.digest) {
	throw new Error("Library inputs changed during the run; rerun before publishing data");
}
const clients = ids.map((id) => {
	const sorted = [...timings[id]].sort((left, right) => left - right);
	const manifest = manifests[id];
	return {
		id,
		name: manifest.name,
		version: manifest.version,
		provenance: id === "http" ? "local-working-tree" : id === "fetch" ? "runtime-builtin" : "npm-published",
		...sizes[id],
		medianUs: sorted[Math.floor(samples / 2)],
		minUs: sorted[0],
		maxUs: sorted.at(-1),
		samplesUs: timings[id],
		runtimeDependencies: Object.keys(manifest.dependencies ?? {}).length,
		runtimeDependencyNames: Object.keys(manifest.dependencies ?? {}).sort(),
	};
});
const result = {
	measuredAt: new Date().toISOString(),
	runtime: { name: "Bun", version: Bun.version, revision: Bun.revision },
	platform: { os: platform(), release: release(), arch: arch() },
	cpu: { model: cpus()[0]?.model ?? "unknown", logicalCores: cpus().length },
	methodology: {
		description: "In-memory client-overhead microbenchmark with no network overhead; not real-world request speed.",
		iterations,
		warmup,
		samples,
		concurrency: 1,
		sampleOrder,
		statistic: "Median/min/max of sample mean microseconds per sequential GET+JSON operation; not request percentiles.",
		bundler: {
			name: "Bun.build",
			version: Bun.version,
			target: "browser",
			format: "esm",
			minify: true,
			splitting: false,
			sourcemap: "none",
			gzipLevel: 9,
		},
		bundleScope:
			"Minimal exported parameterized GET+JSON fixtures, client defaults retained (http uses bare and cache:false to avoid the default singleton); includes wrapper bytes. Native fetch implementation is built into the runtime, not bundled.",
		timingScope:
			"Browser-bundled clients executed in Bun, reused instances, identical injected fetch returns a fresh Response from a pre-serialized string. Includes request processing, Response construction, JSON parsing, full payload validation and checksum. Excludes module loading, bundling and client construction. GC is not forced.",
		clientOptions: {
			http: "bare; cache:false; retry:0; timeout:0; default response cloning retained",
			axios: "adapter:fetch; env.fetch injected; timeout:0; responseType:json; no retry plugin",

			fetch: "injected transport; status check; Response.json; no retry or timeout",
		},
		transport:
			"No sockets, DNS, TLS, server, bandwidth or network latency. Global fetch throws; each operation must call the shared injected fetch exactly once.",
		payload: { json: payload, bytes: payloadBytes, encoding: "utf-8", status: 200, contentType: "application/json" },
		dependencyCount:
			"Declared direct package.json dependencies only, not transitive dependencies or browser-retained modules.",
		localSource: initialSource,
		localBuild: {
			command: "bun run build",
			artifact: "dist/index.js",
			sha256: sha256(await Bun.file(join(root, "dist/index.js")).bytes()),
			tsdownVersion: (await json(join(root, "node_modules/tsdown/package.json"))).version,
		},
		benchmarkLockSha256: sha256(await Bun.file(join(directory, "bun.lock")).bytes()),
		validation: { transportCalls: calls, checksum, expectedCalls: ids.length * (warmup + samples * iterations) },
	},
	clients,
};
const destination = join(root, "docs/src/data/client-comparison.json");
const serialized = `${JSON.stringify(result, null, "\t")}\n`;
await Bun.write(join(output, "client-comparison.json"), serialized);
await mkdir(join(root, "docs/src/data"), { recursive: true });
// Write the completed result only after every build, request and provenance check succeeds.
await Bun.write(join(output, "homepage-result.tmp"), serialized);
await rename(join(output, "homepage-result.tmp"), destination);
process.stdout.write(
	`${clients.map((client) => `${client.name}: ${client.bundleBytes} B / ${client.gzipBytes} B gzip; ${client.medianUs.toFixed(3)} us/op median`).join("\n")}\nWrote docs/src/data/client-comparison.json\n`
);
