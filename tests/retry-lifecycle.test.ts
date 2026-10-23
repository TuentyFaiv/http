import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HttpFetch, ServiceError } from "../src/index.js";

import { Http } from "../src/index.js";
import { jsonResponse } from "./helpers.js";

describe("retry cancellation and cleanup", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it.each([undefined, 2])("checks a pre-aborted signal before sending (retry: %s)", async (retry) => {
		const controller = new AbortController();
		const reason = new Error("cancelled before sending");
		const fetch = vi.fn<HttpFetch>().mockResolvedValue(jsonResponse({ data: {} }));
		const api = Http.create("https://retry-pre-abort.test", { fetch, cache: false });

		controller.abort(reason);

		await expect(api.get("/", { signal: controller.signal, retry })).rejects.toBe(reason);
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(["status", "retry-after", "network"] as const)(
		"aborts during %s backoff without sending again",
		async (failure) => {
			const controller = new AbortController();
			const reason = new Error("cancelled during backoff");
			const fetch = vi.fn<HttpFetch>();

			if (failure === "network") {
				fetch.mockRejectedValue(new TypeError("offline"));
			} else {
				fetch.mockImplementation(async () =>
					jsonResponse(
						{ message: "busy" },
						{
							status: 503,
							headers: failure === "retry-after" ? { "Retry-After": "60" } : undefined,
						}
					)
				);
			}
			const api = Http.create("https://retry-backoff.test", { fetch, cache: false });
			const rejected = vi.fn();
			const pending = api
				.get("/", {
					signal: controller.signal,
					retry: { attempts: 3, delay: 60_000 },
				})
				.catch(rejected);

			await vi.advanceTimersByTimeAsync(0);
			expect(fetch).toHaveBeenCalledOnce();
			expect(vi.getTimerCount()).toBe(1);

			controller.abort(reason);
			await vi.advanceTimersByTimeAsync(0);

			expect(rejected).toHaveBeenCalledExactlyOnceWith(reason);
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(120_000);
			expect(fetch).toHaveBeenCalledOnce();
			await pending;
		}
	);

	it("honours the request timeout while waiting to retry", async () => {
		// Native AbortSignal.timeout does not use Vitest's fake clock.
		vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
			const controller = new AbortController();

			setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), milliseconds);

			return controller.signal;
		});
		const fetch = vi.fn<HttpFetch>().mockImplementation(async () => jsonResponse({ message: "busy" }, { status: 503 }));
		const api = Http.create("https://retry-timeout.test", { fetch, cache: false });
		const rejected = vi.fn();
		const pending = api.get("/", { timeout: 100, retry: { attempts: 2, delay: 60_000 } }).catch(rejected);

		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(100);

		expect(rejected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "TimeoutError" }));
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(fetch).toHaveBeenCalledOnce();
		await pending;
	});

	it.each([new Error("custom cancellation"), { code: "cancelled" }, "cancelled"])(
		"does not retry a transport rejection caused by an arbitrary signal reason (%s)",
		async (reason) => {
			const controller = new AbortController();
			const fetch = vi.fn<HttpFetch>().mockImplementation(() => {
				controller.abort(reason);

				return Promise.reject(reason);
			});
			const api = Http.create("https://retry-reason.test", { fetch, cache: false });
			const rejected = vi.fn();
			const pending = api.get("/", { signal: controller.signal, retry: { attempts: 3, delay: 100 } }).catch(rejected);

			await vi.advanceTimersByTimeAsync(0);

			expect(rejected).toHaveBeenCalledOnce();
			const error = rejected.mock.calls[0]?.[0];

			if (reason instanceof Error) {
				expect(error).toBe(reason);
			} else {
				expect(error).toBeInstanceOf(Error);
				expect(error.cause).toBe(reason);
			}
			await vi.advanceTimersByTimeAsync(1000);
			expect(fetch).toHaveBeenCalledOnce();
			await pending;
		}
	);

	it.each(["status", "network"] as const)(
		"propagates a throwing delay callback once after %s failure",
		async (failure) => {
			const reason = new Error("delay callback failed");
			const delay = vi.fn(() => {
				throw reason;
			});
			const fetch = vi.fn<HttpFetch>();

			if (failure === "network") {
				fetch.mockRejectedValue(new TypeError("offline"));
			} else {
				fetch.mockResolvedValue(jsonResponse({ message: "busy" }, { status: 503 }));
			}
			const api = Http.create("https://retry-delay-error.test", { fetch, cache: false });

			await expect(api.get("/", { retry: { attempts: 3, delay } })).rejects.toBe(reason);
			expect(delay).toHaveBeenCalledOnce();
			expect(fetch).toHaveBeenCalledOnce();
			expect(vi.getTimerCount()).toBe(0);
		}
	);

	it.each(["resolve", "reject", "hang"] as const)(
		"cancels a discarded response before resending without waiting for cleanup to %s",
		async (cleanup) => {
			const cancel = vi.fn(() => {
				if (cleanup === "reject") {
					return Promise.reject(new Error("cleanup failed"));
				}
				if (cleanup === "hang") {
					return new Promise<void>(() => {
						// Models a tee branch waiting for its unread sibling.
					});
				}

				return Promise.resolve();
			});
			const discarded = new Response(new ReadableStream({ cancel }), { status: 503 });
			const fetch = vi
				.fn<HttpFetch>()
				.mockResolvedValueOnce(discarded)
				.mockImplementation(async () => {
					expect(cancel).toHaveBeenCalledOnce();

					return jsonResponse({ data: { ok: true } });
				});
			const api = Http.create("https://retry-cleanup.test", { fetch, cache: false });
			const resolved = vi.fn();
			const rejected = vi.fn();
			const pending = api.get("/", { retry: { attempts: 1, delay: 10 } }).then(resolved, rejected);

			await vi.advanceTimersByTimeAsync(10);

			expect(fetch).toHaveBeenCalledTimes(2);
			expect(cancel).toHaveBeenCalledOnce();
			expect(rejected).not.toHaveBeenCalled();
			expect(resolved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payload: { ok: true } }));
			await pending;
		}
	);

	it("does not evaluate the retry policy after cancellation during response cleanup", async () => {
		const controller = new AbortController();
		const reason = new Error("cancelled during cleanup");
		const response = new Response(
			new ReadableStream({
				cancel() {
					controller.abort(reason);
				},
			}),
			{ status: 503 }
		);
		const fetch = vi.fn<HttpFetch>().mockResolvedValue(response);
		const delay = vi.fn(() => {
			throw new Error("must not replace the abort reason");
		});
		const api = Http.create("https://retry-cleanup-abort.test", { fetch, cache: false });

		await expect(api.get("/", { signal: controller.signal, retry: { attempts: 2, delay } })).rejects.toBe(reason);
		expect(fetch).toHaveBeenCalledOnce();
		expect(delay).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([404, 503])("leaves a terminal %s response readable", async (status) => {
		const response = jsonResponse({ message: "terminal response" }, { status });
		const cancel = vi.spyOn(response.body as ReadableStream, "cancel");
		const fetch = vi.fn<HttpFetch>().mockResolvedValue(response);
		const api = Http.create("https://retry-terminal.test", { fetch, cache: false });

		// POST is deliberately not opted in, so even 503 is terminal.
		const error = (await api
			.post("/", {}, { retry: { attempts: 2, delay: 10 } })
			.catch((thrown: unknown) => thrown)) as ServiceError;

		expect(error.status).toBe(status);
		expect(error.message).toBe("terminal response");
		expect(cancel).not.toHaveBeenCalled();
		await expect(error.response?.json()).resolves.toEqual({ message: "terminal response" });
		expect(fetch).toHaveBeenCalledOnce();
	});

	it.each(["status", "network"] as const)(
		"never retries a ReadableStream request body after %s failure",
		async (failure) => {
			const body = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("request body"));
					controller.close();
				},
			});
			const reason = new TypeError("offline");
			const response = jsonResponse({ message: "stream upload failed" }, { status: 503 });
			const cancel = vi.spyOn(response.body as ReadableStream, "cancel");
			const fetch = vi.fn<HttpFetch>();

			if (failure === "network") {
				fetch.mockRejectedValue(reason);
			} else {
				fetch.mockResolvedValue(response);
			}
			const api = Http.create("https://retry-stream.test", { fetch, cache: false });
			const rejected = vi.fn();
			const pending = api
				.post("/", body, {
					retry: { attempts: 2, delay: 100, methods: ["POST"] },
				})
				.catch(rejected);

			await vi.advanceTimersByTimeAsync(0);

			expect(fetch.mock.calls[0]?.[1]?.body).toBe(body);
			expect(rejected).toHaveBeenCalledOnce();
			if (failure === "network") {
				expect(rejected).toHaveBeenCalledExactlyOnceWith(reason);
			} else {
				const error = rejected.mock.calls[0]?.[0] as ServiceError;

				expect(error.status).toBe(503);
				expect(error.message).toBe("stream upload failed");
				expect(cancel).not.toHaveBeenCalled();
				await expect(error.response?.json()).resolves.toEqual({ message: "stream upload failed" });
			}
			await vi.advanceTimersByTimeAsync(1000);
			expect(fetch).toHaveBeenCalledOnce();
			await pending;
		}
	);
});
