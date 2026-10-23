import { afterEach, describe, expect, it, vi } from "vitest";

import type {
	HttpConfirmedUploadOptions,
	HttpProgress,
	HttpUploadChunkContext,
	HttpUploadChunkReceipt,
} from "../src/helpers.js";

import { uploadConfirmed } from "../src/helpers.js";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((success, failure) => {
		resolve = success;
		reject = failure;
	});
	return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

describe("server-confirmed uploads", () => {
	it("sends ordered byte slices and advances only after their receipts", async () => {
		const first = deferred<HttpUploadChunkReceipt>();
		const entered = deferred<void>();
		const parts: Blob[] = [];
		const offsets: number[] = [];
		const events: HttpProgress[] = [];
		const pending = uploadConfirmed(new Blob(["abcde"]), {
			chunkSize: 2,
			sendChunk(chunk, context) {
				parts.push(chunk);
				offsets.push(context.offset);
				expect(context.total).toBe(5);
				if (parts.length === 1) {
					entered.resolve();
					return first.promise;
				}
				return { receivedBytes: chunk.size };
			},
			onUploadProgress: (event) => events.push(event),
		});
		await entered.promise;
		expect(parts).toHaveLength(1);
		expect(events).toEqual([{ loaded: 0, total: 5, percent: 0, done: false }]);

		first.resolve({ receivedBytes: 2 });
		await expect(pending).resolves.toEqual({ receivedBytes: 5, total: 5, chunks: 3 });
		expect(offsets).toEqual([0, 2, 4]);
		expect(await Promise.all(parts.map((part) => part.text()))).toEqual(["ab", "cd", "e"]);
		expect(events).toEqual([
			{ loaded: 0, total: 5, percent: 0, done: false },
			{ loaded: 2, total: 5, percent: 40, done: false },
			{ loaded: 4, total: 5, percent: 80, done: false },
			{ loaded: 5, total: 5, percent: 100, done: true },
		]);
	});

	it("defaults to 256 KiB chunks without buffering the entire file", async () => {
		const body = new File([new Uint8Array(262_145)], "synthetic.bin");
		const read = vi.spyOn(body, "arrayBuffer");
		const sendChunk = vi.fn((chunk: Blob) => ({ receivedBytes: chunk.size }));
		await expect(uploadConfirmed(body, { sendChunk })).resolves.toEqual({
			receivedBytes: body.size,
			total: body.size,
			chunks: 2,
		});
		expect(sendChunk.mock.calls.map(([chunk]) => chunk.size)).toEqual([262_144, 1]);
		expect(read).not.toHaveBeenCalled();
	});

	it("counts bytes rather than characters", async () => {
		const body = new Blob(["ñ😀"]);
		const parts: Blob[] = [];
		const result = await uploadConfirmed(body, {
			chunkSize: 2,
			sendChunk(chunk) {
				parts.push(chunk);
				return { receivedBytes: chunk.size };
			},
		});
		expect(result).toEqual({ receivedBytes: 6, total: 6, chunks: 3 });
		expect(await new Blob(parts).text()).toBe("ñ😀");
	});

	it("requires a zero-byte acknowledgement before completing an empty upload", async () => {
		const receipt = deferred<HttpUploadChunkReceipt>();
		const entered = deferred<void>();
		const events: HttpProgress[] = [];
		const pending = uploadConfirmed(new Blob(), {
			sendChunk(chunk, context) {
				expect(chunk.size).toBe(0);
				expect(context.offset).toBe(0);
				entered.resolve();
				return receipt.promise;
			},
			onUploadProgress: (event) => events.push(event),
		});
		await entered.promise;
		expect(events).toEqual([{ loaded: 0, total: 0, percent: 0, done: false }]);
		receipt.resolve({ receivedBytes: 0 });
		await expect(pending).resolves.toEqual({ receivedBytes: 0, total: 0, chunks: 1 });
		expect(events.at(-1)).toEqual({ loaded: 0, total: 0, percent: 100, done: true });
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid chunk size %s before sending or reporting",
		async (chunkSize) => {
			const sendChunk = vi.fn();
			const onUploadProgress = vi.fn();
			await expect(uploadConfirmed(new Blob(["a"]), { chunkSize, sendChunk, onUploadProgress })).rejects.toThrow();
			expect(sendChunk).not.toHaveBeenCalled();
			expect(onUploadProgress).not.toHaveBeenCalled();
		}
	);

	it.each([
		null,
		undefined,
		{},
		{ receivedBytes: "2" },
		{ receivedBytes: -1 },
		{ receivedBytes: 1.5 },
		{ receivedBytes: Number.NaN },
		{ receivedBytes: Number.MAX_SAFE_INTEGER + 1 },
		{ receivedBytes: 0 },
		{ receivedBytes: 1 },
		{ receivedBytes: 3 },
	])("rejects malformed or mismatched receipts (%j) without advancing", async (receipt) => {
		const events: HttpProgress[] = [];
		const sendChunk = vi.fn(() => receipt as HttpUploadChunkReceipt);
		await expect(
			uploadConfirmed(new Blob(["abcd"]), { chunkSize: 2, sendChunk, onUploadProgress: (event) => events.push(event) })
		).rejects.toThrow();
		expect(sendChunk).toHaveBeenCalledOnce();
		expect(events).toEqual([{ loaded: 0, total: 4, percent: 0, done: false }]);
	});

	it("retains prior confirmations without counting a later failed chunk", async () => {
		const events: HttpProgress[] = [];
		const sendChunk = vi.fn().mockReturnValueOnce({ receivedBytes: 2 }).mockReturnValueOnce({ receivedBytes: 1 });
		await expect(
			uploadConfirmed(new Blob(["abcd"]), { chunkSize: 2, sendChunk, onUploadProgress: (event) => events.push(event) })
		).rejects.toThrow();
		expect(events.map(({ loaded }) => loaded)).toEqual([0, 2]);
		expect(events.some(({ done }) => done)).toBe(false);
	});

	it("snapshots options so later mutations do not change this operation", async () => {
		const sizes: number[] = [];
		const laterSender = vi.fn();
		const laterProgress = vi.fn();
		const options: HttpConfirmedUploadOptions = {
			chunkSize: 2,
			sendChunk(chunk) {
				sizes.push(chunk.size);
				return { receivedBytes: chunk.size };
			},
			onUploadProgress() {
				options.chunkSize = 1;
				options.sendChunk = laterSender;
				options.onUploadProgress = laterProgress;
			},
		};
		await expect(uploadConfirmed(new Blob(["abcde"]), options)).resolves.toMatchObject({ chunks: 3 });
		expect(sizes).toEqual([2, 2, 1]);
		expect(laterSender).not.toHaveBeenCalled();
		expect(laterProgress).not.toHaveBeenCalled();
	});

	it("does not use a mutable progress event as internal accounting state", async () => {
		const observed: number[] = [];
		await expect(
			uploadConfirmed(new Blob(["abc"]), {
				chunkSize: 2,
				sendChunk: (chunk) => ({ receivedBytes: chunk.size }),
				onUploadProgress(event) {
					observed.push(event.loaded);
					event.loaded = 999;
				},
			})
		).resolves.toEqual({ receivedBytes: 3, total: 3, chunks: 2 });
		expect(observed).toEqual([0, 2, 3]);
	});

	it.each([new Error("cancel"), { code: "cancel" }, "cancel"])(
		"rejects pre-abort with the exact reason and no work (%s)",
		async (reason) => {
			const controller = new AbortController();
			controller.abort(reason);
			const sendChunk = vi.fn();
			const onUploadProgress = vi.fn();
			await expect(
				uploadConfirmed(new Blob(["a"]), { signal: controller.signal, sendChunk, onUploadProgress })
			).rejects.toBe(reason);
			expect(sendChunk).not.toHaveBeenCalled();
			expect(onUploadProgress).not.toHaveBeenCalled();
		}
	);

	it.each(["resolve", "reject"] as const)("stops waiting on abort and consumes late sender %s", async (settlement) => {
		const controller = new AbortController();
		const reason = { code: "cancel" };
		const receipt = deferred<HttpUploadChunkReceipt>();
		const entered = deferred<void>();
		const onUploadProgress = vi.fn();
		const add = vi.spyOn(controller.signal, "addEventListener");
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		const timer = vi.spyOn(globalThis, "setTimeout");
		const sendChunk = vi.fn((_chunk: Blob, { signal }: HttpUploadChunkContext) => {
			expect(signal).toBe(controller.signal);
			entered.resolve();
			return receipt.promise;
		});
		const pending = uploadConfirmed(new Blob(["abcd"]), {
			chunkSize: 2,
			signal: controller.signal,
			sendChunk,
			onUploadProgress,
		});
		await entered.promise;
		const rejected = expect(pending).rejects.toBe(reason);
		controller.abort(reason);
		await rejected;
		if (settlement === "resolve") {
			receipt.resolve({ receivedBytes: 2 });
		} else {
			receipt.reject(new Error("late sender failure"));
		}
		await Promise.resolve();
		await Promise.resolve();
		expect(sendChunk).toHaveBeenCalledOnce();
		expect(onUploadProgress).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
		expect(timer).not.toHaveBeenCalled();
	});

	it("allows a progress callback to abort before the next send", async () => {
		const controller = new AbortController();
		const reason = new Error("stop");
		const sendChunk = vi.fn((chunk: Blob) => ({ receivedBytes: chunk.size }));
		await expect(
			uploadConfirmed(new Blob(["abcd"]), {
				chunkSize: 2,
				signal: controller.signal,
				sendChunk,
				onUploadProgress({ loaded }) {
					if (loaded === 2) {
						controller.abort(reason);
					}
				},
			})
		).rejects.toBe(reason);
		expect(sendChunk).toHaveBeenCalledOnce();
	});

	it.each(["sender", "progress"] as const)("preserves %s errors and removes listeners", async (source) => {
		const controller = new AbortController();
		const error = new Error("original failure");
		const add = vi.spyOn(controller.signal, "addEventListener");
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		const sendChunk = vi.fn((chunk: Blob) => {
			if (source === "sender") {
				throw error;
			}
			return { receivedBytes: chunk.size };
		});
		await expect(
			uploadConfirmed(new Blob(["abcd"]), {
				chunkSize: 2,
				signal: controller.signal,
				sendChunk,
				onUploadProgress({ loaded }) {
					if (source === "progress" && loaded) {
						throw error;
					}
				},
			})
		).rejects.toBe(error);
		expect(sendChunk).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
	});

	it("cleans up listeners after every successful receipt", async () => {
		const controller = new AbortController();
		const add = vi.spyOn(controller.signal, "addEventListener");
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		await uploadConfirmed(new Blob(["abc"]), {
			chunkSize: 2,
			signal: controller.signal,
			sendChunk: (chunk) => ({ receivedBytes: chunk.size }),
		});
		expect(add).toHaveBeenCalledTimes(2);
		for (const [, listener] of add.mock.calls) {
			expect(remove).toHaveBeenCalledWith("abort", listener);
		}
	});
});
