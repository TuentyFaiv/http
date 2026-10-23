import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { HttpLogger, HttpRetryOptions } from "../src/index.js";

import { bare, ContentType, Http } from "../src/index.js";
import { jsonResponse, recorder, sentHeaders } from "./helpers.js";

function gate() {
	let release = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});

	return { promise, release };
}

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("client configure", () => {
	it("patches supplied defaults and replaces headers and params rather than merging them", async () => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://configure-patch.test", {
			fetch,
			headers: { "X-Old": "old", Authorization: "old" },
			params: { old: 1 },
			secure: false,
		});
		const shared = Http.create("https://configure-patch.test");

		expectTypeOf(shared.configure({})).toEqualTypeOf<void>();
		shared.configure({ headers: { "X-New": "new", Authorization: "new" }, params: { next: 2 } });
		await api.post("/test", {});

		expect(calls[0]?.url).toBe("https://configure-patch.test/test?next=2");
		expect(sentHeaders(calls[0]?.init).get("X-New")).toBe("new");
		expect(sentHeaders(calls[0]?.init).has("X-Old")).toBe(false);
		expect(sentHeaders(calls[0]?.init).has("Authorization")).toBe(false);

		shared.configure({ secure: undefined });
		await api.get("/test");
		expect(sentHeaders(calls[1]?.init).get("Authorization")).toBe("new");
	});

	it("resets supplied undefined fields to built-in defaults", async () => {
		const custom = recorder();
		const fallback = recorder();
		vi.stubGlobal("fetch", fallback.fetch);
		const api = Http.create("https://configure-reset.test", {
			fetch: custom.fetch,
			headers: { "X-Old": "yes", "Content-Type": "text/plain" },
			params: { old: 1 },
			paramsSerializer: () => "custom=yes",
		});

		api.configure({ fetch: undefined, headers: undefined, params: undefined, paramsSerializer: undefined });
		await api.post("/test", { value: 1 });

		expect(custom.calls).toHaveLength(0);
		expect(fallback.calls[0]?.url).toBe("https://configure-reset.test/test");
		expect(sentHeaders(fallback.calls[0]?.init).has("X-Old")).toBe(false);
		expect(sentHeaders(fallback.calls[0]?.init).get("Content-Type")).toBe(ContentType.APPLICATION_JSON);
	});

	it("resets timeout, retry, logging, and error-message defaults", async () => {
		const { fetch, calls } = recorder(() => jsonResponse({ message: "busy" }, { status: 503 }));
		const logged = vi.fn();
		const api = Http.create("https://configure-reset-policy.test", {
			fetch,
			timeout: 5000,
			retry: { attempts: 2, delay: 0 },
			log: true,
			errorMessage: "initial message",
			logger: { error: logged },
		});

		api.configure({ timeout: undefined, retry: undefined, log: undefined, errorMessage: undefined, logger: undefined });
		const { error } = await api.safe.get("/test");

		expect(error?.message).toBe("busy");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.init?.signal).toBeUndefined();
		expect(logged).not.toHaveBeenCalled();
	});

	it("keeps per-request overrides ahead of configured defaults", async () => {
		const { fetch, calls } = recorder(() => jsonResponse({ message: "busy" }, { status: 503 }));
		const logged = vi.fn();
		const api = Http.create("https://configure-precedence.test", { fetch });

		api.configure({
			headers: { Authorization: "default", "X-Default": "yes" },
			params: { page: 1, locale: "en" },
			secure: false,
			timeout: 5000,
			retry: { attempts: 2, delay: 0 },
			log: true,
			logger: { error: logged },
		});
		const { error } = await api.safe.get<unknown, { page: number }>("/test", {
			headers: new Headers({ Authorization: "request" }),
			params: { page: 2 },
			secure: true,
			timeout: 0,
			retry: 0,
			log: false,
			errorMessage: "request message",
		});

		expect(error?.message).toBe("request message");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://configure-precedence.test/test?page=2&locale=en");
		expect(calls[0]?.init?.signal).toBeUndefined();
		expect(sentHeaders(calls[0]?.init).get("Authorization")).toBe("request");
		expect(sentHeaders(calls[0]?.init).get("X-Default")).toBe("yes");
		expect(logged).not.toHaveBeenCalled();
	});

	it("does not partially update defaults if normalization fails", async () => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://configure-atomic.test", { fetch, params: { original: 1 } });

		expect(() => api.configure({ params: { changed: 1 }, headers: { "Invalid Header": "bad" } })).toThrow(TypeError);
		await api.get("/test");
		expect(calls[0]?.url).toBe("https://configure-atomic.test/test?original=1");
	});

	it("rejects lifecycle fields at runtime and in the public type", () => {
		const api = Http.create("https://configure-invalid.test");

		expect(() => {
			// @ts-expect-error Presets are fixed at creation.
			api.configure({ preset: bare });
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error Registry membership is fixed at creation.
			api.configure({ cache: false });
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error Hooks are managed by hook/unsubscribe.
			api.configure({ hooks: {} });
		}).toThrow(TypeError);
	});

	it("snapshots defaults and all hook lists before the first asynchronous hook", async () => {
		vi.useFakeTimers();
		const blocked = gate();
		const events: string[] = [];
		const oldTransport = recorder(() => jsonResponse({}, { status: 503 }));
		const nextTransport = recorder(() => jsonResponse({}, { status: 503 }));
		const oldLogger: HttpLogger = {
			request: () => {
				events.push("old log request");
			},
			response: () => {
				events.push("old log response");
			},
			error: () => {
				events.push("old log error");
			},
		};
		const nextLogger: HttpLogger = {
			error: () => {
				events.push("next log error");
			},
		};
		const api = Http.create("https://configure-snapshot.test", {
			fetch: oldTransport.fetch,
			headers: { "X-Version": "old" },
			params: { version: "old" },
			errorMessage: "old failure",
			log: true,
			logger: oldLogger,
			retry: { attempts: 1, delay: 0 },
		});
		const unblock = api.hook("request", () => blocked.promise);
		const offRequest = api.hook("request", () => {
			events.push("old request");
		});
		const offResponse = api.hook("response", () => {
			events.push("old response");
		});
		const offError = api.hook("error", () => {
			events.push("old error");
		});
		const pending = api.get("/test").catch((error: unknown) => error);

		api.configure({
			fetch: nextTransport.fetch,
			headers: { "X-Version": "next" },
			params: { version: "next" },
			errorMessage: "next failure",
			logger: nextLogger,
			retry: 0,
		});
		unblock();
		offRequest();
		offResponse();
		offError();
		api.hook("request", () => {
			events.push("next request");
		});
		api.hook("response", () => {
			events.push("next response");
		});
		api.hook("error", () => {
			events.push("next error");
		});
		blocked.release();
		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ message: "old failure" });

		expect(oldTransport.calls).toHaveLength(2);
		expect(oldTransport.calls[0]?.url).toBe("https://configure-snapshot.test/test?version=old");
		expect(sentHeaders(oldTransport.calls[0]?.init).get("X-Version")).toBe("old");
		expect(nextTransport.calls).toHaveLength(0);
		expect(events).toEqual([
			"old request",
			"old log request",
			"old response",
			"old log response",
			"old log error",
			"old error",
		]);

		events.length = 0;
		await expect(api.get("/test")).rejects.toThrow("next failure");
		expect(nextTransport.calls).toHaveLength(1);
		expect(nextTransport.calls[0]?.url).toBe("https://configure-snapshot.test/test?version=next");
		expect(sentHeaders(nextTransport.calls[0]?.init).get("X-Version")).toBe("next");
		expect(events).toEqual(["next request", "next response", "next log error", "next error"]);
	});

	it("keeps error hooks and logging captured before a response hook rejects late", async () => {
		const entered = gate();
		const blocked = gate();
		const error = new Error("late response failure");
		const oldError = vi.fn();
		const newError = vi.fn();
		const logged = vi.fn();
		const { fetch } = recorder();
		const api = Http.create("https://configure-late-error.test", {
			fetch,
			log: true,
			logger: { error: logged },
		});
		const offResponse = api.hook("response", async () => {
			entered.release();
			await blocked.promise;
			throw error;
		});
		const offError = api.hook("error", oldError);
		const pending = api.get("/test").catch((thrown: unknown) => thrown);
		await entered.promise;

		api.configure({ log: false, logger: {} });
		offResponse();
		offError();
		api.hook("error", newError);
		blocked.release();
		expect(await pending).toBe(error);

		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalledWith(expect.objectContaining({ error }));
		expect(oldError).toHaveBeenCalledTimes(1);
		expect(newError).not.toHaveBeenCalled();
		await api.get("/next");
		expect(logged).toHaveBeenCalledTimes(1);
	});

	it("copies per-request retry options before awaiting request hooks", async () => {
		vi.useFakeTimers();
		const blocked = gate();
		const retry: HttpRetryOptions = { attempts: 1, delay: 0, methods: ["GET"], statusCodes: [503] };
		const { fetch, calls } = recorder(() => jsonResponse({}, { status: 503 }));
		const api = Http.create("https://configure-request-copy.test", { fetch });
		api.hook("request", () => blocked.promise);
		const pending = api.get("/test", { retry }).catch((error: unknown) => error);

		retry.attempts = 0;
		retry.methods?.splice(0);
		retry.statusCodes?.splice(0);
		blocked.release();
		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ status: 503 });
		expect(calls).toHaveLength(2);
	});

	it.each(["create", "configure"] as const)("copies headers and retry options supplied to %s", async (source) => {
		vi.useFakeTimers();
		const headers = new Headers({ "X-Version": "original" });
		const retry: HttpRetryOptions = { attempts: 1, delay: 0, methods: ["GET"], statusCodes: [503] };
		const { fetch, calls } = recorder(() => jsonResponse({}, { status: 503 }));
		const update = { headers, retry };
		const api = Http.create(`https://configure-copy-${source}.test`, {
			fetch,
			...(source === "create" ? update : {}),
		});

		if (source === "configure") {
			api.configure(update);
		}
		headers.set("X-Version", "mutated");
		retry.attempts = 0;
		retry.methods?.splice(0);
		retry.statusCodes?.splice(0);
		const pending = api.get("/test").catch((error: unknown) => error);

		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ status: 503 });
		expect(calls).toHaveLength(2);
		expect(sentHeaders(calls[0]?.init).get("X-Version")).toBe("original");
	});
});
