// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Assert literal GitHub Actions expressions.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

interface Step {
	uses?: string;
	run?: string;
	with?: Record<string, string | number | boolean>;
}

interface Job {
	name: string;
	steps: Step[];
	strategy?: { matrix: { node: number[] } };
}

const workflow: { jobs: Record<string, Job> } = JSON.parse(
	execFileSync("bun", ["--eval", "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))"], {
		input: readFileSync(".github/workflows/ci.yml", "utf8"),
		encoding: "utf8",
	})
);

function nodeSetupIndex(steps: Step[], version: string | number) {
	return steps.findIndex(
		(step) => step.uses?.startsWith("actions/setup-node@") && step.with?.["node-version"] === version
	);
}

describe("CI build and consumer runtime separation", () => {
	it("builds on Node 24 before selecting the consumer runtime, without rebuilding afterward", () => {
		const { steps } = workflow.jobs["package-smoke"];
		const buildNode = nodeSetupIndex(steps, 24);
		const install = steps.findIndex((step) => step.run === "bun install --frozen-lockfile");
		const build = steps.findIndex((step) => step.run === "bun run build");
		const consumerNode = nodeSetupIndex(steps, "${{ matrix.node }}");
		const smoke = steps.findIndex((step) => step.run === "bun scripts/package-smoke.mjs");
		expect(buildNode).toBeGreaterThanOrEqual(0);
		expect(buildNode).toBeLessThan(install);
		expect(install).toBeLessThan(build);
		expect(build).toBeLessThan(consumerNode);
		expect(consumerNode).toBeLessThan(smoke);
		expect(steps.slice(consumerNode + 1).flatMap((step) => (step.run ? [step.run] : []))).toEqual([
			"bun scripts/package-smoke.mjs",
			"node node_modules/vitest/vitest.mjs run tests/native-http.test.ts tests/progress.test.ts",
		]);
	});

	it("preserves all supported consumer versions and the required-check names", () => {
		const job = workflow.jobs["package-smoke"];
		expect(job.name).toBe("Packed consumer (Node ${{ matrix.node }})");
		expect(job.strategy?.matrix.node).toEqual([20, 22, 24]);
	});

	it("selects a supported build runtime explicitly in the library verification job", () => {
		const { steps } = workflow.jobs.verify;
		const buildNode = nodeSetupIndex(steps, 24);
		const install = steps.findIndex((step) => step.run === "bun install --frozen-lockfile");
		expect(buildNode).toBeGreaterThanOrEqual(0);
		expect(buildNode).toBeLessThan(install);
	});
});
