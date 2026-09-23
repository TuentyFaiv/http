# Reproducible HTTP client comparisons

This package owns the measurements consumed by `docs/src/data/client-comparison.json`.
**Timing is an in-memory client-overhead microbenchmark with no network overhead, not real-world request speed.** Do not present these values as network latency, browser latency, or a universal client ranking.

## Run

Requires Bun **1.4.2** (recorded revision in JSON), and the root library's existing build dependencies. The benchmark does not install or change root dependencies. From the repository root:

```sh
bun benchmarks/install-isolated.mjs
bun benchmarks/run.mjs
bun benchmarks/verify.mjs
```

Or run `bun run setup` and `bun run measure` from `benchmarks/`. **Do not run a normal `bun install` inside this workspace checkout**: ancestor workspace discovery can select the root lockfile. The setup script copies this standalone package and its lockfile into an OS temporary directory, runs Bun with `--frozen-lockfile --ignore-scripts`, and copies resolved dependency contents back. Its download cache stays in `benchmarks/.cache/`. On initial lock creation only, `--frozen-lockfile` is omitted. Setup needs access to `registry.npmjs.org`; measurement and verification need no network. No install lifecycle scripts run.

Axios **1.20.0** was selected by querying `https://registry.npmjs.org/axios/latest` and is an exact dev-only pin in this package. `bun.lock` pins the transitive installation. To upgrade deliberately, query the registry again, change the exact pins, remove only `benchmarks/bun.lock`, then run setup and measure. Never change root manifests or lockfiles for these comparisons.

The runner invokes the existing root `bun run build` (writes `dist/` only), then writes actual minified browser ESM artifacts into ignored `benchmarks/output/`. It replaces homepage JSON only after all builds, measurements, package-version and source-stability checks succeed. Failed runs throw instead of fabricating data; an older successful JSON, if present, remains dated as such. Run verification immediately after measurement: generated bundles are not committed.

Optional formatting/checking, using the already installed root Biome (safe fixes only):

```sh
bun x --no-install biome check --write benchmarks/*.mjs benchmarks/fixtures/*.mjs benchmarks/package.json docs/src/data/client-comparison.json
bun x --no-install biome check benchmarks/*.mjs benchmarks/fixtures/*.mjs benchmarks/package.json docs/src/data/client-comparison.json
```

## Bundle methodology

- Three separate entrypoints in `fixtures/` expose `getJson(url)`. The URL is a runtime argument; exported request functions cannot be discarded as unused constants.
- `Bun.build`: browser target, ESM, minification, no source maps or splitting. Normal package/browser resolution and tree shaking; no hand-selected stripped distributions. Axios defaults retain its available browser adapters; size does **not** use a custom fetch-only build. The local public build exports `Http` and `bare` for raw parsed JSON, with `cache:false` to avoid reusing the default exported envelope instance at the empty base URL; no features are manually removed. Retry and timeout implementations remain available in size fixtures.
- Byte counts include the minimal wrapper. Gzip uses Node-compatible `gzipSync` at level 9. Small wrappers can gzip to more bytes than the original.
- Native fetch's implementation is supplied by the environment. Its reported bytes are only the status-check/JSON wrapper, not an implementation-size comparison.
- Local `@tuentyfaiv/http` is the **working tree**, not the npm release sharing its manifest version. SHA-256 records sorted root-relative paths, a NUL, file bytes, and a NUL for every `src/` file plus root package/build/config/lock inputs. JSON includes that exact file list, the built artifact hash, tsdown version and benchmark lock hash.
- Dependency counts are the number of keys in the package's declared direct `dependencies` field, not transitive installations or modules retained by the browser bundler. Native fetch has zero npm dependencies. Axios's Node-oriented dependencies still count because these are package-level declarations.

## Timing methodology

`clients.mjs` is also browser-bundled before execution in Bun, so Axios does not accidentally time its Node HTTP adapter. Instances are created once outside the timed region:

| Client | Configuration |
| --- | --- |
| Local HTTP | `bare`, injected fetch, `cache:false`, `retry:0`, `timeout:0` |
| Axios | real `adapter:"fetch"`, `env:{fetch:transport}`, `timeout:0`, `responseType:"json"`; no retry plugin |

| Native fetch | same transport, explicit status check, `Response.json()`; no retries or timeout |

There is no fake Axios adapter returning pre-parsed data. Axios still constructs its Request and uses its normal fetch response handling and JSON transform. The local client's default response-cloning behavior is retained. These implementation differences are intentionally measured, not normalized away.

All three share one transport function returning a promise for a **fresh HTTP 200 Response** with the same pre-serialized UTF-8 JSON string and headers. The transport verifies GET and the expected URL. It cannot open sockets; global fetch is replaced with a throwing function before timing modules load. Each batch asserts exactly one injected transport call per operation.

Every operation awaits parsed JSON, reserializes the full value, validates equality with the expected payload and adds its length to an observable checksum. These common costs, Response creation, normal client processing and parsing are included. Payload serialization for transport, module loading, builds, client construction, and batch-count assertions are outside the timed region.

- 500 warmup operations per client, then 9 samples of 2,000 sequential operations per client; concurrency 1.
- Client order rotates by one position per sample. Nine samples balance the three clients across all three positions; raw order is recorded. There is no random seed or claimed randomization.
- Each sample is wall-clock elapsed time (`performance.now`) divided by iterations, converted to microseconds. `medianUs`, `minUs`, `maxUs` summarize these **sample means**, not individual-request percentiles. All sample values are retained.
- No forced GC, background-load control, CPU pinning, process isolation or confidence intervals. JIT warmup, allocation/GC, OS scheduling and thermal state affect results. Reruns will differ.
- This is Bun on the recorded CPU/OS, **not a browser timing experiment**. Browser bundle sizing is separate. Only a small successful GET+JSON workload is measured, not uploads, streaming, errors, retries or end-to-end latency.

## Exact output schema

All numeric measurements are JSON numbers, bytes are UTF-8 byte counts, times are microseconds unless explicitly named otherwise. Object keys below match the generated output; fields are not optional.

```ts
type Id = 'http' | 'axios' | 'fetch';
type Comparison = {
  measuredAt: string; // ISO 8601 UTC completion timestamp
  runtime: { name: string; version: string; revision: string };
  platform: { os: string; release: string; arch: string };
  cpu: { model: string; logicalCores: number };
  methodology: {
    description: string;
    iterations: number; warmup: number; samples: number; concurrency: number;
    sampleOrder: Id[][];
    statistic: string;
    bundler: {
      name: string; version: string; target: string; format: string;
      minify: boolean; splitting: boolean; sourcemap: string; gzipLevel: number;
    };
    bundleScope: string;
    timingScope: string;
    clientOptions: Record<Id, string>;
    transport: string;
    payload: { json: string; bytes: number; encoding: string; status: number; contentType: string };
    dependencyCount: string;
    localSource: { algorithm: string; digest: string; files: string[] };
    localBuild: { command: string; artifact: string; sha256: string; tsdownVersion: string };
    benchmarkLockSha256: string;
    validation: { transportCalls: number; checksum: number; expectedCalls: number };
  };
  clients: Array<{
    id: Id; name: string; version: string;
    provenance: 'local-working-tree' | 'npm-published' | 'runtime-builtin';
    bundleBytes: number; gzipBytes: number; bundleSha256: string;
    medianUs: number; minUs: number; maxUs: number; samplesUs: number[];
    runtimeDependencies: number; runtimeDependencyNames: string[];
  }>;
};
```

For homepage use, show measurement date, local-source provenance, payload size and the “no network overhead; not real-world speed” label alongside values. Prefer the units “µs/op, median sample mean”. Do not round data on disk, subtract the native baseline, or turn these results into an unsupported “X times faster on the network” claim.

`verify.mjs` checks the three emitted browser exports on a mock fetch, exact bundle/gzip bytes and hashes, payload bytes, sample statistics, and transport/checksum totals. It does not claim browser-engine compatibility or replace the library's test suite.
