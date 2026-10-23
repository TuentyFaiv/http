import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { HttpClient, HttpPreset, ResponseContext } from "../src/index.js";

import { bare, envelope, Http, problem, rest } from "../src/index.js";
import { jsonResponse, recorder, sentHeaders } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("client registry", () => {
	it("shares the client, safe proxy, and hook subscriptions for an exact API string", async () => {
		const { fetch, calls } = recorder();
		const first = Http.create("https://registry-shared.test", { fetch });
		const second = Http.create("https://registry-shared.test");
		const hook = vi.fn();
		const off = first.hook("request", hook);

		expect(second).toBe(first);
		expect(second.safe).toBe(first.safe);
		await second.safe.get("/one");
		off();
		await second.get("/two");
		expect(hook).toHaveBeenCalledTimes(1);
		expect(calls).toHaveLength(2);
		expect(Http.create("https://registry-shared.test/")).not.toBe(first);
		expect(Http.create("https://REGISTRY-shared.test")).not.toBe(first);
	});

	it("ignores later defaults and hooks rather than reconfiguring a shared client", async () => {
		const original = recorder();
		const ignored = recorder();
		const initialHook = vi.fn();
		const ignoredHook = vi.fn();
		const first = Http.create("https://registry-initial.test", {
			fetch: original.fetch,
			headers: { "X-Initial": "yes" },
			params: { initial: 1 },
			hooks: { request: [initialHook] },
		});
		const second = Http.create("https://registry-initial.test", {
			fetch: ignored.fetch,
			headers: { "X-Later": "no" },
			params: { later: 2 },
			hooks: { request: [ignoredHook] },
		});

		expect(second).toBe(first);
		await second.get("/test");
		expect(original.calls[0]?.url).toBe("https://registry-initial.test/test?initial=1");
		expect(sentHeaders(original.calls[0]?.init).get("X-Initial")).toBe("yes");
		expect(sentHeaders(original.calls[0]?.init).has("X-Later")).toBe(false);
		expect(initialHook).toHaveBeenCalledTimes(1);
		expect(ignoredHook).not.toHaveBeenCalled();
		expect(ignored.calls).toHaveLength(0);
	});

	it("fixes the first preset by identity, even when another preset has the same shape", () => {
		const api = Http.create("https://registry-preset.test", { preset: bare });

		expect(Http.create("https://registry-preset.test", { preset: bare })).toBe(api);
		expect(() => Http.create("https://registry-preset.test", { preset: problem })).toThrow(TypeError);
		expect(() => Http.create("https://registry-preset.test", { preset: { ...bare } })).toThrow(TypeError);
		expect(() => Http.create("https://registry-preset.test")).toThrow(TypeError);
	});

	it("treats omitted presets as an envelope shape assertion, not a type cast", () => {
		Http.create("https://registry-rest.test", { preset: rest });
		expect(() => Http.create("https://registry-rest.test", {})).toThrow(TypeError);

		const customEnvelope = envelope.extend({ name: "registry-envelope" });
		const api = Http.create("https://registry-envelope.test", { preset: customEnvelope });

		expect(Http.create("https://registry-envelope.test")).toBe(api);
		expect(() => Http.create("https://registry-envelope.test", { preset: envelope })).toThrow(TypeError);

		const defaultApi = Http.create("https://registry-default.test");

		expect(Http.create("https://registry-default.test", { preset: envelope })).toBe(defaultApi);
		expect(() => Http.create("https://registry-default.test", { preset: bare })).toThrow(TypeError);
	});

	it("preserves class-based preset methods and their private receiver state", async () => {
		class ClassPreset implements HttpPreset<"bare"> {
			name = "class";
			shape = "bare" as const;
			readonly #enabled = true;

			validate(_context: ResponseContext): undefined {
				expect(this.#enabled).toBe(true);
			}

			build<T>(context: ResponseContext): T {
				expect(this.#enabled).toBe(true);
				return context.body as T;
			}
		}

		const preset = new ClassPreset();
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://registry-class.test", { fetch, preset });

		expect(Http.create("https://registry-class.test", { preset })).toBe(api);
		await expect(api.get<{ id: number }>("/test")).resolves.toEqual({ id: 1 });
	});

	it("bypasses both registry lookup and registration with cache:false", () => {
		const shared = Http.create("https://registry-bypass.test", { preset: bare });
		const isolated = Http.create("https://registry-bypass.test", { cache: false });

		expect(isolated).not.toBe(shared);
		expect(Http.create("https://registry-bypass.test", { cache: false })).not.toBe(isolated);
		expect(Http.create("https://registry-bypass.test", { preset: bare })).toBe(shared);

		const unregistered = Http.create("https://registry-unregistered.test", { cache: false, preset: bare });

		expect(Http.create("https://registry-unregistered.test")).not.toBe(unregistered);
	});

	it("does not expose the registry or persist clients to browser storage", () => {
		const storage = {
			getItem: vi.fn(() => {
				throw new Error("storage must not be read");
			}),
			setItem: vi.fn(() => {
				throw new Error("storage must not be written");
			}),
			removeItem: vi.fn(),
		};
		vi.stubGlobal("localStorage", storage);
		vi.stubGlobal("sessionStorage", storage);
		const api = Http.create("https://registry-storage.test");

		api.configure({ timeout: 5000, headers: { "X-State": "updated" } });
		expect(Http.create("https://registry-storage.test")).toBe(api);
		expect("instance" in Http).toBe(false);
		expect(storage.getItem).not.toHaveBeenCalled();
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it("infers envelope by default and requires an actual preset for non-default generics", () => {
		expectTypeOf(Http.create("https://registry-types.test")).toEqualTypeOf<HttpClient<"envelope">>();
		expectTypeOf(Http.create("https://registry-types-bare.test", { preset: bare })).toEqualTypeOf<HttpClient<"bare">>();
		expectTypeOf(Http.create("https://registry-types-rest.test", { preset: rest })).toEqualTypeOf<HttpClient<"rest">>();

		// biome-ignore lint/correctness/noConstantCondition: invalid calls must never execute.
		if (false) {
			// @ts-expect-error A generic argument cannot substitute for a runtime preset.
			Http.create<"bare">("https://registry-types-invalid.test");
			// @ts-expect-error A config without a preset cannot select a non-default shape.
			Http.create<"rest">("https://registry-types-invalid.test", { cache: false });
			// @ts-expect-error The registry is private.
			Http.instance;
		}
	});
});
