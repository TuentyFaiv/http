// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Assert literal GitHub Actions expressions.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface Step {
	id?: string;
	uses?: string;
	run?: string;
	env?: Record<string, string>;
	with?: Record<string, string | number | boolean>;
	"working-directory"?: string;
}

interface Job {
	needs?: string;
	environment?: { name: string };
	permissions?: Record<string, string>;
	outputs?: Record<string, string>;
	steps: Step[];
}

interface Workflow {
	on: { release: { types: string[] } };
	permissions: Record<string, string>;
	defaults: { run: { shell: string } };
	jobs: Record<"build" | "publish", Job>;
}

// Use the project's Bun YAML parser instead of adding a test-only dependency.
const workflow: Workflow = JSON.parse(
	execFileSync("bun", ["--eval", "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))"], {
		input: readFileSync(".github/workflows/npm-publish.yml", "utf8"),
		encoding: "utf8",
	})
);
const { build, publish } = workflow.jobs;
const publishStep = publish.steps.find((step) => step.run);
if (!publishStep?.run) {
	throw new Error("Missing publish command");
}
const publishScript = publishStep.run;
const actionPin = /^[\w/-]+@[a-f0-9]{40}$/;
const forbiddenPublishCommands = /\b(?:bun|git|npx)\b|\bnpm\s+(?:install|run|exec)\b|\bscripts\//;

describe("release workflow permissions and artifact handoff", () => {
	it("only grants OIDC to the publishing job after the build and npm environment gate", () => {
		expect(workflow.on).toEqual({ release: { types: ["published"] } });
		expect(Object.keys(workflow.jobs).sort()).toEqual(["build", "publish"]);
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(workflow.defaults.run.shell).toBe("bash");
		expect(build.permissions ?? workflow.permissions).toEqual({ contents: "read" });
		expect(build.environment).toBeUndefined();
		expect(publish.needs).toBe("build");
		expect(publish.environment).toEqual({ name: "npm" });
		expect(publish.permissions).toEqual({ contents: "read", "id-token": "write" });
	});

	it("checks out the exact event commit without persisted credentials", () => {
		const checkout = build.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
		expect(checkout?.with).toEqual({
			ref: "${{ github.sha }}",
			"fetch-depth": 0,
			"persist-credentials": false,
		});
	});

	it("packs once and tests the same tarball before uploading it", () => {
		const commands = build.steps.flatMap((step) => (step.run ? [step.run] : []));
		expect(commands).toContain("bun scripts/verify-release.mjs");
		for (const check of ["lint", "format:check", "typecheck", "test", "build"]) {
			expect(commands).toContain(`bun run ${check}`);
		}
		expect(commands.filter((command) => command.includes("bun pm pack"))).toHaveLength(1);
		const pack = build.steps.findIndex((step) => step.id === "pack");
		const smoke = build.steps.findIndex(
			(step) => step.run === "bun scripts/package-smoke.mjs .temp/release-artifact/package.tgz"
		);
		const verify = build.steps.findIndex((step) =>
			step.run?.includes('new Error("Release tarball checksum mismatch")')
		);
		const upload = build.steps.findIndex((step) => step.id === "artifact");
		expect(build.steps[pack].run).toContain(
			"bun pm pack --ignore-scripts --filename .temp/release-artifact/package.tgz"
		);
		expect(build.steps[verify].env?.EXPECTED_SHA256).toBe("${{ steps.pack.outputs.tarball-sha256 }}");
		expect(pack).toBeLessThan(smoke);
		expect(smoke).toBeLessThan(verify);
		expect(verify).toBeLessThan(upload);
	});

	it("downloads the immutable artifact by ID and takes the checksum from job outputs", () => {
		expect(build.outputs).toEqual({
			"dist-tag": "${{ steps.release.outputs.dist-tag }}",
			"tarball-sha256": "${{ steps.pack.outputs.tarball-sha256 }}",
			"artifact-id": "${{ steps.artifact.outputs.artifact-id }}",
		});
		const upload = build.steps.find((step) => step.id === "artifact");
		expect(upload?.with).toMatchObject({
			path: ".temp/release-artifact/package.tgz",
			"include-hidden-files": true,
			"if-no-files-found": "error",
			"retention-days": 7,
		});
		const download = publish.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
		expect(download?.with).toEqual({
			"artifact-ids": "${{ needs.build.outputs.artifact-id }}",
			"merge-multiple": true,
			path: "${{ runner.temp }}/fetchzen-release",
		});
		expect(publishStep.env).toEqual({
			EXPECTED_SHA256: "${{ needs.build.outputs.tarball-sha256 }}",
			DIST_TAG: "${{ needs.build.outputs.dist-tag }}",
		});
		expect(publishStep["working-directory"]).toBe("${{ runner.temp }}/fetchzen-release");
	});

	it("pins every action and keeps checkout, dependencies, and repository code out of publishing", () => {
		for (const job of Object.values(workflow.jobs)) {
			for (const step of job.steps) {
				if (step.uses) {
					expect(step.uses).toMatch(actionPin);
				}
			}
		}
		expect(publish.steps.map((step) => step.uses?.split("@")[0] ?? "run")).toEqual([
			"actions/setup-node",
			"actions/download-artifact",
			"run",
		]);
		expect(publish.steps[0].with).toEqual({
			"node-version": 24,
			"registry-url": "https://registry.npmjs.org",
			"package-manager-cache": false,
		});
		expect(publishScript).not.toMatch(forbiddenPublishCommands);
	});
});

describe("publishing command with a fake npm executable", () => {
	let workspace: string;
	let checksum: string;
	let argsFile: string;

	beforeEach(() => {
		mkdirSync(".temp", { recursive: true });
		workspace = mkdtempSync(resolve(".temp/release-workflow-"));
		mkdirSync(resolve(workspace, "bin"));
		argsFile = resolve(workspace, "npm-args");
		writeFileSync(resolve(workspace, "package.tgz"), "tested package fixture");
		checksum = createHash("sha256")
			.update(readFileSync(resolve(workspace, "package.tgz")))
			.digest("hex");
		writeFileSync(resolve(workspace, "bin/npm"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$NPM_ARGS_FILE"\n', {
			mode: 0o755,
		});
	});

	afterEach(() => {
		rmSync(workspace, { recursive: true, force: true });
	});

	function runPublish(expectedChecksum = checksum, distTag = "latest") {
		return spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", publishScript], {
			cwd: workspace,
			env: {
				HOME: workspace,
				PATH: `${resolve(workspace, "bin")}${delimiter}${process.env.PATH}`,
				EXPECTED_SHA256: expectedChecksum,
				DIST_TAG: distTag,
				NPM_ARGS_FILE: argsFile,
			},
			encoding: "utf8",
			timeout: 5000,
		});
	}

	it.each(["latest", "beta"])("publishes the checked tarball to %s with provenance and scripts disabled", (tag) => {
		const result = runPublish(checksum, tag);
		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr).toBe(0);
		expect(readFileSync(argsFile, "utf8").trim().split("\n")).toEqual([
			"publish",
			"./package.tgz",
			"--access",
			"public",
			"--provenance",
			"--ignore-scripts",
			"--tag",
			tag,
		]);
	});

	it.each(["", "invalid", "0".repeat(64)])(
		"never invokes npm for a missing, invalid, or wrong checksum (%s)",
		(value) => {
			const result = runPublish(value);
			expect(result.error).toBeUndefined();
			expect(result.status).not.toBe(0);
			expect(existsSync(argsFile)).toBe(false);
		}
	);

	it("never invokes npm if the tested tarball was modified", () => {
		writeFileSync(resolve(workspace, "package.tgz"), "changed package fixture");
		const result = runPublish();
		expect(result.error).toBeUndefined();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Release tarball checksum mismatch");
		expect(existsSync(argsFile)).toBe(false);
	});

	it("never invokes npm if the tarball is missing", () => {
		unlinkSync(resolve(workspace, "package.tgz"));
		const result = runPublish();
		expect(result.error).toBeUndefined();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("ENOENT");
		expect(existsSync(argsFile)).toBe(false);
	});

	it.each(["", "next", "latest; echo unexpected", "$(echo unexpected)"])(
		"never invokes npm for an unapproved dist-tag (%s)",
		(tag) => {
			const result = runPublish(checksum, tag);
			expect(result.error).toBeUndefined();
			expect(result.status).not.toBe(0);
			expect(existsSync(argsFile)).toBe(false);
		}
	);
});
