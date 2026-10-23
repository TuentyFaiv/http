import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const [suppliedTarball, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length) {
	throw new Error("Usage: bun scripts/package-smoke.mjs [tarball.tgz]");
}
mkdirSync(".temp", { recursive: true });
const workspace = mkdtempSync(resolve(".temp/package-smoke-"));
function run(command, cwd = root) {
	const result = Bun.spawnSync(command, { cwd, stdout: "inherit", stderr: "inherit" });
	if (result.exitCode !== 0) {
		throw new Error(`Failed: ${command.join(" ")}`);
	}
}
// Release CI supplies the artifact to test; local checks can still pack their own.
if (!suppliedTarball) {
	run(["bun", "pm", "pack", "--ignore-scripts", "--destination", workspace]);
}
const tarball = suppliedTarball || readdirSync(workspace).find((name) => name.endsWith(".tgz"));
if (!tarball) {
	throw new Error("Missing tarball");
}
const tarballPath = suppliedTarball ? resolve(tarball) : resolve(workspace, tarball);
run(["tar", "-xzf", tarballPath, "-C", workspace]);
const extracted = resolve(workspace, "package");
const target = resolve(workspace, "node_modules/fetchzen");
mkdirSync(resolve(workspace, "node_modules"), { recursive: true });
run(["mv", extracted, target]);
const packed = JSON.parse(readFileSync(resolve(target, "package.json"), "utf8"));
if (packed.name !== "fetchzen") {
	throw new Error("Packed package must be named fetchzen");
}
if (packed.dependencies || packed.scripts?.install || packed.scripts?.postinstall || packed.scripts?.preinstall) {
	throw new Error("Package must have no runtime dependencies or install hooks");
}
// Every emitted shared chunk must ship, including declaration chunks not listed in exports.
for (const file of readdirSync(resolve(root, "dist"))) {
	if (
		/\.(js|d\.ts)$/.test(file) &&
		readFileSync(resolve(root, "dist", file), "utf8") !== readFileSync(resolve(target, "dist", file), "utf8")
	) {
		throw new Error(`Packed chunk differs: ${file}`);
	}
}
writeFileSync(resolve(workspace, "package.json"), '{"type":"module"}');
writeFileSync(
	resolve(workspace, "runtime.mjs"),
	`
import assert from "node:assert/strict";
const forbidden = () => { throw new Error("Import touched network/storage"); };
globalThis.fetch = forbidden;
for (const key of ["localStorage", "sessionStorage", "indexedDB"]) {
  Object.defineProperty(globalThis, key, { get: forbidden, configurable: true });
}
const helpers = await import("fetchzen/helpers");
assert.equal("default" in helpers, false);
assert.equal("Http" in helpers, false);
const root = await import("fetchzen");
for (const key of Object.keys(helpers)) assert.equal(root[key], helpers[key], key);
assert.equal(root.default, (await import("fetchzen")).default);
assert.equal(root.default instanceof root.Http, true);
assert.equal(new root.ServiceError({ message: "smoke", status: 400, statusText: "Bad", errors: [] }) instanceof helpers.ServiceError, true);
console.log("Packed runtime identity/import smoke passed");
`
);
run(["node", resolve(workspace, "runtime.mjs")]);
run(["bun", resolve(workspace, "runtime.mjs")]);
for (const entry of ["fetchzen", "fetchzen/helpers"]) {
	writeFileSync(
		resolve(workspace, "types.ts"),
		`
import type { ApplyShape as RootShape, HttpPreset as RootPreset } from "fetchzen";
import type { ApplyShape as HelperShape, HttpPreset as HelperPreset } from "fetchzen/helpers";
declare module "${entry}" { interface HttpShapes<T> { smoke: { payload: T; trace: string } } }
const root: RootShape<"smoke", number> = { payload: 1, trace: "ok" };
const helper: HelperShape<"smoke", number> = root;
const back: RootShape<"smoke", number> = helper;
declare const preset: HelperPreset<"smoke">;
const shared: RootPreset<"smoke"> = preset;
// @ts-expect-error custom shapes preserve the payload type
const invalid: HelperShape<"smoke", number> = { payload: "bad", trace: "ok" };
void [back, shared, invalid];
`
	);
	run([
		"bun",
		Bun.resolveSync("typescript/bin/tsc", root),
		"--noEmit",
		"--strict",
		"--skipLibCheck",
		"false",
		"--module",
		"NodeNext",
		"--moduleResolution",
		"NodeNext",
		"--target",
		"ES2022",
		resolve(workspace, "types.ts"),
	]);
}
writeFileSync(
	resolve(workspace, "browser.ts"),
	'export * from "fetchzen"; export { default } from "fetchzen"; export * as helpers from "fetchzen/helpers";'
);
const browser = await Bun.build({
	entrypoints: [resolve(workspace, "browser.ts")],
	target: "browser",
	outdir: resolve(workspace, "browser"),
});
if (!browser.success) {
	throw new Error(`Browser bundle failed: ${browser.logs}`);
}
process.stdout.write(`Package smoke passed; retained fixture: ${workspace}\n`);
