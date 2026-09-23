// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone verification CLI, not a test-discovery file
// biome-ignore-all lint/performance/noAwaitInLoops: verify each emitted artifact independently
// biome-ignore-all lint/style/noMagicNumbers: schema invariants and gzip level match the recorded methodology
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const directory = import.meta.dir;
const result = await Bun.file(join(directory, "../docs/src/data/client-comparison.json")).json();
const { methodology } = result;
assert.deepEqual(
	result.clients.map((client) => client.id),
	["http", "axios", "fetch"]
);
assert.equal(methodology.payload.bytes, Buffer.byteLength(methodology.payload.json));
assert.equal(methodology.validation.transportCalls, methodology.validation.expectedCalls);
assert.equal(
	methodology.validation.expectedCalls,
	result.clients.length * (methodology.warmup + methodology.samples * methodology.iterations)
);
assert.equal(methodology.validation.checksum, methodology.payload.json.length * methodology.validation.expectedCalls);
assert.ok(Number.isFinite(Date.parse(result.measuredAt)));
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = () => {
	calls += 1;
	return Promise.resolve(new Response(methodology.payload.json, { headers: { "content-type": "application/json" } }));
};
try {
	for (const client of result.clients) {
		const path = join(directory, "output", `${client.id}.js`);
		const bytes = await Bun.file(path).bytes();
		assert.equal(client.bundleBytes, bytes.length);
		assert.equal(client.gzipBytes, gzipSync(bytes, { level: 9 }).length);
		assert.equal(client.bundleSha256, createHash("sha256").update(bytes).digest("hex"));
		assert.equal(client.samplesUs.length, methodology.samples);
		assert.ok(client.samplesUs.every((value) => Number.isFinite(value) && value > 0));
		const sorted = [...client.samplesUs].sort((left, right) => left - right);
		assert.equal(client.minUs, sorted[0]);
		assert.equal(client.medianUs, sorted[Math.floor(sorted.length / 2)]);
		assert.equal(client.maxUs, sorted.at(-1));
		assert.equal(client.runtimeDependencies, client.runtimeDependencyNames.length);
		const { getJson } = await import(path);
		assert.equal(JSON.stringify(await getJson("https://benchmark.invalid/items")), methodology.payload.json);
	}
	assert.equal(calls, result.clients.length);
} finally {
	globalThis.fetch = originalFetch;
}
process.stdout.write(
	"Verified three browser bundle exports, hashes, sizes, payloads, sample statistics and transport/checksum totals.\n"
);
