import { describe, expect, it } from "vitest";

import type { HttpFetch } from "../src/index.js";

import { anySignal, composeSignal, Http } from "../src/index.js";

/** Never settles on its own; only the signal can end it, like a real fetch. */
const hang: HttpFetch = (_url, init) =>
	new Promise((_resolve, reject) => {
		const signal = init?.signal;

		if (!signal) {
			return;
		}

		if (signal.aborted) {
			reject(signal.reason);

			return;
		}

		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
	});

describe("timeout", () => {
	it("aborts the request with a TimeoutError", async () => {
		const api = Http.create("https://timeout-1.test", { fetch: hang });

		const error = (await api.get("/slow", { timeout: 10 }).catch((thrown: unknown) => thrown)) as Error;

		expect(error.name).toBe("TimeoutError");
	});

	it("can be set once on the instance", async () => {
		const api = Http.create("https://timeout-2.test", { fetch: hang, timeout: 10 });

		const error = (await api.get("/slow").catch((thrown: unknown) => thrown)) as Error;

		expect(error.name).toBe("TimeoutError");
	});

	it("lets a per-request timeout override the instance", async () => {
		const api = Http.create("https://timeout-3.test", { fetch: hang, timeout: 50_000 });

		const error = (await api.get("/slow", { timeout: 10 }).catch((thrown: unknown) => thrown)) as Error;

		expect(error.name).toBe("TimeoutError");
	});

	it("still honours a caller signal alongside a timeout", async () => {
		const controller = new AbortController();
		const api = Http.create("https://timeout-4.test", { fetch: hang });

		const pending = api.get("/slow", { timeout: 50_000, signal: controller.signal }).catch((thrown: unknown) => thrown);

		controller.abort();

		const error = (await pending) as Error;

		expect(error.name).toBe("AbortError");
	});
});

describe("signal composition", () => {
	it("returns the caller signal untouched with no timeout", () => {
		const controller = new AbortController();

		expect(composeSignal(controller.signal)).toBe(controller.signal);
		expect(composeSignal(undefined, 0)).toBeUndefined();
	});

	it("aborts when any of the composed signals aborts", () => {
		const first = new AbortController();
		const second = new AbortController();
		const composed = anySignal([first.signal, second.signal]);

		expect(composed.aborted).toBe(false);

		second.abort();

		expect(composed.aborted).toBe(true);
	});
});
