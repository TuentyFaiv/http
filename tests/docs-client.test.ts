import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoContext } from "../docs/src/scripts/demo-request-helper.js";

import { exampleText } from "../docs/src/i18n/examples.js";
import { requestDemo } from "../docs/src/scripts/demo-request-helper.js";
import { downloadDemo, streamDemo, uploadDemo } from "../docs/src/scripts/demo-transfer-helper.js";
import { handleDemo } from "../docs/src/server/demo.js";

function context(fields: Record<string, string> = {}): DemoContext {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		form.set(key, value);
	}
	return {
		base: "https://docs.example.test/api/examples/",
		signal: new AbortController().signal,
		form,
		text: exampleText("en-US"),
		log: vi.fn(),
		result: vi.fn(),
		progress: vi.fn(),
	};
}

beforeEach(() => {
	vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => handleDemo(new Request(input, init)));
});
afterEach(() => vi.unstubAllGlobals());

describe("live example client code", () => {
	it.each(["envelope", "bare", "rest", "problem"])("uses the %s preset", async (preset) => {
		const result = await requestDemo("json", context({ name: "Ada", method: "GET", preset }));
		expect(JSON.stringify(result)).toContain("Ada");
	});

	it("sends JSON and receives only allowed fields", async () => {
		const result = await requestDemo("json", context({ method: "POST", body: '{"name":"Ada","secret":"omitted"}' }));
		expect(JSON.stringify(result)).toContain("Ada");
		expect(JSON.stringify(result)).not.toContain("omitted");
	});

	it("reports safe HTTP failures without rejecting", async () => {
		const result = await requestDemo("safe", context({ preset: "problem", status: "422" }));
		expect(result).toMatchObject({ error: { status: 422 }, data: null });
	});

	it("validates the unwrapped payload and rejects a mismatched schema", async () => {
		await expect(requestDemo("schema", context({ name: "Ada" }))).resolves.toMatchObject({ payload: { name: "Ada" } });
		await expect(requestDemo("schema", context({ name: "Ada", invalid: "on" }))).rejects.toThrow();
	});

	it("retries with per-transport attempt headers, not per-request hooks", async () => {
		const demo = context();
		await expect(requestDemo("retry", demo)).resolves.toMatchObject({ payload: { attempt: 3 } });
		expect(demo.log).toHaveBeenCalledWith(demo.text.requestHook);
		expect(vi.mocked(demo.log).mock.calls.filter(([message]) => message === demo.text.requestHook)).toHaveLength(1);
	});

	it("uploads real bytes and receives a non-persistence receipt", async () => {
		const demo = context();
		demo.form.set("file", new File(["hello"], "demo.txt"));
		await expect(uploadDemo(demo)).resolves.toMatchObject({ data: { bytes: 5, stored: false } });
		expect(demo.progress).not.toHaveBeenCalled();
	});

	it.each([true, false])("downloads bytes with known length = %s", async (known) => {
		const demo = context(known ? { known: "on" } : {});
		await expect(downloadDemo(demo)).resolves.toMatchObject({ bytes: 262_144 });
		expect(demo.progress).toHaveBeenLastCalledWith(262_144, known ? 262_144 : undefined);
	});

	it("renders NDJSON records incrementally", async () => {
		const demo = context();
		await expect(streamDemo(demo)).resolves.toHaveLength(6);
		expect(demo.result).toHaveBeenCalledTimes(6);
	});
});
