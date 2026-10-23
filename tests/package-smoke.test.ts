import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
	mkdirSync: vi.fn(),
	mkdtempSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}));
vi.mock("node:fs", () => io);

const modulePath = "../scripts/package-smoke.mjs";
const originalArgv = process.argv;
const run = vi.fn();
const workspace = resolve(".temp/mock-package-smoke");

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	io.mkdtempSync.mockReturnValue(workspace);
	// Stop at the first command so these tests never pack or extract real files.
	run.mockReturnValue({ exitCode: 1 });
	vi.stubGlobal("Bun", { spawnSync: run });
});

afterEach(() => {
	process.argv = originalArgv;
	vi.unstubAllGlobals();
});

describe("package smoke tarball selection", () => {
	it("packs locally without lifecycle scripts when no tarball is supplied", async () => {
		process.argv = ["bun", "scripts/package-smoke.mjs"];
		await expect(import(modulePath)).rejects.toThrow("Failed: bun pm pack");
		expect(run).toHaveBeenCalledOnce();
		expect(run.mock.calls[0][0]).toEqual(["bun", "pm", "pack", "--ignore-scripts", "--destination", workspace]);
	});

	it("tests the supplied tarball without repacking or falling back to another package", async () => {
		process.argv = ["bun", "scripts/package-smoke.mjs", ".temp/release artifact/package.tgz"];
		await expect(import(modulePath)).rejects.toThrow("Failed: tar");
		expect(run).toHaveBeenCalledOnce();
		expect(run.mock.calls[0][0]).toEqual([
			"tar",
			"-xzf",
			resolve(".temp/release artifact/package.tgz"),
			"-C",
			workspace,
		]);
		expect(io.readdirSync).not.toHaveBeenCalled();
	});

	it("rejects extra arguments before any file or subprocess operations", async () => {
		process.argv = ["bun", "scripts/package-smoke.mjs", "package.tgz", "unexpected"];
		await expect(import(modulePath)).rejects.toThrow("Usage:");
		expect(run).not.toHaveBeenCalled();
		expect(io.mkdirSync).not.toHaveBeenCalled();
	});
});
