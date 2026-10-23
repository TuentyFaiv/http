import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ApplyShape, HttpSafeResult, StandardSchemaV1 } from "../src/index.js";

import * as publicApi from "../src/index.js";
import { bare, Http, rest, ServiceError } from "../src/index.js";
import { jsonResponse, recorder, sentHeaders } from "./helpers.js";

interface User {
	id: number;
}

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("safe request primitive", () => {
	it("works on the frozen client, retains a stable function, and supports detached calls", async () => {
		const { fetch, calls } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://safe-primitive.test", { cache: false, fetch });
		const { request } = api.safe;
		const result = await request<{ name: string }, User>({
			method: "POST",
			endpoint: "/users",
			body: { name: "Ada" },
			params: { page: 2 },
			headers: { "X-Request": "yes" },
		});

		expectTypeOf(result).toEqualTypeOf<HttpSafeResult<ApplyShape<"envelope", User>>>();
		expect(Object.isFrozen(api)).toBe(true);
		expect(api.safe.request).toBe(request);
		expect(api.request).not.toBe(request);
		expect(Reflect.set(api.safe, "request", api.request)).toBe(false);
		expect(api.safe).not.toHaveProperty("configure");
		expect(api.safe).not.toHaveProperty("hook");
		expect("request" in api.safe).toBe(true);
		expect("get" in api.safe).toBe(true);
		expect("post" in api.safe).toBe(true);
		expect(result.error).toBeUndefined();
		expect(result.data?.payload).toEqual({ id: 1 });
		expect(calls[0]?.url).toBe("https://safe-primitive.test/users?page=2");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.body).toBe('{"name":"Ada"}');
		expect(sentHeaders(calls[0]?.init).get("X-Request")).toBe("yes");
	});

	it("shares configured defaults and hooks through all references without duplicating subscriptions", async () => {
		const { fetch, calls } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://safe-primitive-shared.test", { fetch });
		const same = Http.create("https://safe-primitive-shared.test");
		const hook = vi.fn(({ init }) => {
			init.headers.set("X-Hook", "yes");
		});
		same.configure({ headers: { "X-Configured": "yes" } });
		same.hook("request", hook);

		await api.safe.request({ method: "GET", endpoint: "/users" });

		expect(same.safe).toBe(api.safe);
		expect(same.safe.request).toBe(api.safe.request);
		expect(hook).toHaveBeenCalledOnce();
		expect(sentHeaders(calls[0]?.init).get("X-Hook")).toBe("yes");
		expect(sentHeaders(calls[0]?.init).get("X-Configured")).toBe("yes");
	});

	it("returns a ServiceError instead of throwing while leaving request() unchanged", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "busy" }, { status: 503 }));
		const api = Http.create("https://safe-primitive-http-error.test", { cache: false, fetch });
		const result = await api.safe.request({ method: "GET", endpoint: "/users" });

		expect(result.data).toBeUndefined();
		expect(result.error).toBeInstanceOf(ServiceError);
		expect(result.error).toMatchObject({ status: 503, request: { method: "GET" } });
		await expect(api.request({ method: "GET", endpoint: "/users" })).rejects.toBeInstanceOf(ServiceError);
	});

	it("normalizes non-Error failures and preserves error-hook replacements", async () => {
		const reason = { code: "offline" };
		const { fetch } = recorder(() => {
			throw reason;
		});
		const api = Http.create("https://safe-primitive-native-error.test", { cache: false, fetch });

		const first = await api.safe.request({ method: "GET", endpoint: "/users" });
		expect(first.error).toBeInstanceOf(Error);
		expect(first.error?.cause).toBe(reason);

		const replacement = new TypeError("hook replacement");
		api.hook("error", () => replacement);
		const second = await api.safe.request({ method: "GET", endpoint: "/users" });
		expect(second.error).toBe(replacement);
	});

	it("runs short-circuit response and schema hooks through the normal pipeline", async () => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://safe-primitive-hooks.test", { cache: false, fetch });
		const responseHook = vi.fn();
		api.hook("request", () => jsonResponse({ data: { id: "7" } }));
		api.hook("response", responseHook);
		const schema: StandardSchemaV1<unknown, User> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: (value) => ({ value: { id: Number((value as User).id) } }),
			},
		};
		const result = await api.safe.request({ method: "GET", endpoint: "/users", schema });

		expectTypeOf(result).toEqualTypeOf<HttpSafeResult<ApplyShape<"envelope", User>>>();
		expect(result.data?.payload).toEqual({ id: 7 });
		expect(result.error).toBeUndefined();
		expect(calls).toHaveLength(0);
		expect(responseHook).toHaveBeenCalledOnce();
	});

	it("captures schema and JSON parsing failures without bypassing validation", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: "bad" }));
		const api = Http.create("https://safe-primitive-validation.test", { cache: false, fetch });
		const schema: StandardSchemaV1<unknown, User> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ issues: [{ message: "invalid id", path: ["id"] }] }),
			},
		};
		const invalid = await api.safe.request({ method: "GET", endpoint: "/users", schema });
		expect(invalid.error).toMatchObject({ code: "ERR_SCHEMA", errors: ["id: invalid id"] });
		expect(invalid.data).toBeUndefined();

		api.configure({ fetch: async () => new Response("{broken", { headers: { "Content-Type": "application/json" } }) });
		const malformed = await api.safe.request({ method: "GET", endpoint: "/users" });
		expect(malformed.error).toMatchObject({ code: "ERR_INVALID_JSON" });
		expect(malformed.data).toBeUndefined();
	});

	it("captures request preparation failures before any transport call", async () => {
		const { fetch, calls } = recorder();
		const errorHook = vi.fn();
		const api = Http.create("http://[invalid", { cache: false, fetch, hooks: { error: [errorHook] } });
		const result = await api.safe.request({ method: "GET", endpoint: "/users" });

		expect(result.error).toBeInstanceOf(TypeError);
		expect(result.data).toBeUndefined();
		expect(errorHook).toHaveBeenCalledOnce();
		expect(calls).toHaveLength(0);
	});

	it("runs error hooks for invalid timeout setup as well as transport failures", async () => {
		const { fetch, calls } = recorder();
		const errorHook = vi.fn();
		const api = Http.create("https://safe-primitive-invalid-timeout.test", {
			cache: false,
			fetch,
			hooks: { error: [errorHook] },
		});
		const result = await api.safe.request({ method: "GET", endpoint: "/users", timeout: Number.POSITIVE_INFINITY });

		expect(result.error).toBeInstanceOf(Error);
		expect(result.data).toBeUndefined();
		expect(errorHook).toHaveBeenCalledOnce();
		expect(calls).toHaveLength(0);
	});

	it("infers response modes and preserves the preset shape", async () => {
		const { fetch } = recorder(() => new Response(new Uint8Array([1, 2])));
		const api = Http.create("https://safe-primitive-binary.test", { cache: false, fetch, preset: rest });
		const result = await api.safe.request({ method: "GET", endpoint: "/file", responseType: "arrayBuffer" });

		expectTypeOf(result).toEqualTypeOf<HttpSafeResult<ApplyShape<"rest", ArrayBuffer>>>();
		if (result.error) {
			throw result.error;
		}
		expectTypeOf(result.data.data).toEqualTypeOf<ArrayBuffer>();
		expect([...new Uint8Array(result.data.data)]).toEqual([1, 2]);
	});

	it("infers transformed schema output and allows successful undefined data", async () => {
		const { fetch } = recorder(() => jsonResponse("2025-01-01"));
		const api = Http.create("https://safe-primitive-transform.test", { cache: false, fetch, preset: bare });
		const dateSchema: StandardSchemaV1<string, Date> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: async (value) => ({ value: new Date(String(value)) }),
			},
		};
		const date = await api.safe.request({ method: "GET", endpoint: "/date", schema: dateSchema });

		expectTypeOf(date).toEqualTypeOf<HttpSafeResult<Date>>();
		expect(date.data).toBeInstanceOf(Date);
		const none = await api.safe.request({ method: "GET", endpoint: "/date", responseType: "none" });
		expectTypeOf(none).toEqualTypeOf<HttpSafeResult<undefined>>();
		expect(none).toStrictEqual({ data: undefined, error: undefined });
	});

	it("settles cancellation during backoff without invoking the transport again", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const reason = new Error("cancelled during retry");
		const { fetch, calls } = recorder(() => jsonResponse({ message: "busy" }, { status: 503 }));
		const api = Http.create("https://safe-primitive-retry.test", { cache: false, fetch });
		const pending = api.safe.request({
			method: "GET",
			endpoint: "/users",
			signal: controller.signal,
			retry: { attempts: 2, delay: 60_000 },
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toHaveLength(1);
		controller.abort(reason);
		const result = await pending;

		expect(result.error).toBe(reason);
		expect(result.data).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
		expect(calls).toHaveLength(1);
	});

	it("does not expose retired compatibility APIs", () => {
		const api = Http.create("https://safe-primitive-retired.test", { cache: false });
		expect(publicApi).not.toHaveProperty("throwError");

		// biome-ignore lint/correctness/noConstantCondition: these invalid API calls are compile-time checks only.
		if (false) {
			// @ts-expect-error Binary parsing uses responseType, not a separate flag.
			api.get("/file", { arrayBuffer: true });
			// @ts-expect-error The primitive also rejects the old binary flag.
			api.safe.request({ method: "GET", endpoint: "/file", arrayBuffer: true });
			// @ts-expect-error The method and endpoint remain required.
			api.safe.request({ endpoint: "/file" });
			// @ts-expect-error Use normalizeError; the compatibility alias is removed.
			publicApi.throwError(new Error("test"));
		}
	});
});
