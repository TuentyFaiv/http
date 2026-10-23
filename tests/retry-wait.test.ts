import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { wait } from "../src/logic/functions/retry.js";

describe("retry wait", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it.each([undefined, null])("waits without a signal (%s)", async (signal) => {
		const resolved = vi.fn();
		const pending = wait(100, signal).then(resolved);

		await vi.advanceTimersByTimeAsync(99);
		expect(resolved).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await pending;
		expect(resolved).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("removes its abort listener after resolving", async () => {
		const controller = new AbortController();
		const add = vi.spyOn(controller.signal, "addEventListener");
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		const pending = wait(100, controller.signal);

		expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
		await vi.advanceTimersByTimeAsync(100);
		await pending;

		expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
		expect(vi.getTimerCount()).toBe(0);
		controller.abort(new Error("too late"));
	});

	it.each([new Error("stop"), { code: "cancelled" }, "cancelled"])(
		"rejects with the exact abort reason (%s) and cleans up",
		async (reason) => {
			const controller = new AbortController();
			const add = vi.spyOn(controller.signal, "addEventListener");
			const remove = vi.spyOn(controller.signal, "removeEventListener");
			const rejected = vi.fn();
			const resolved = vi.fn();
			const pending = wait(60_000, controller.signal).then(resolved, rejected);

			expect(vi.getTimerCount()).toBe(1);
			controller.abort(reason);
			await vi.advanceTimersByTimeAsync(0);

			expect(rejected).toHaveBeenCalledExactlyOnceWith(reason);
			expect(rejected.mock.calls[0]?.[0]).toBe(reason);
			expect(resolved).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
			expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
			await pending;
		}
	);

	it("rejects a pre-aborted signal without scheduling a timer or listener", async () => {
		const controller = new AbortController();
		const reason = new Error("already cancelled");

		controller.abort(reason);
		const timer = vi.spyOn(globalThis, "setTimeout");
		const add = vi.spyOn(controller.signal, "addEventListener");

		await expect(wait(60_000, controller.signal)).rejects.toBe(reason);

		expect(timer).not.toHaveBeenCalled();
		expect(add).not.toHaveBeenCalled();
	});
});
