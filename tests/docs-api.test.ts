import { afterEach, describe, expect, it, vi } from "vitest";

import { handleDemo } from "../docs/src/server/demo.js";

function request(action: string, init?: RequestInit): Request {
	return new Request(`https://example.test/http/api/examples/${action}`, init);
}

function streamedBody(chunks: Uint8Array[], cancel = vi.fn()): RequestInit {
	return {
		method: "POST",
		body: new ReadableStream<Uint8Array>({
			pull(controller) {
				const chunk = chunks.shift();
				if (chunk) {
					controller.enqueue(chunk);
				} else {
					controller.close();
				}
			},
			cancel,
		}),
		...{ duplex: "half" },
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("docs demo API", () => {
	it("echoes only safe fields and applies security headers", async () => {
		const response = await handleDemo(
			request("echo?name=Ada&token=secret&message=Hi", {
				headers: { Authorization: "Bearer secret", Cookie: "session=secret" },
			})
		);
		expect(await response.json()).toEqual({
			data: { name: "Ada", method: "GET", query: { name: "Ada", message: "Hi" } },
		});
		expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
	});

	it("uses the optional fixed-length runtime stream and propagates cancellation", async () => {
		vi.useFakeTimers();
		const lengths: number[] = [];
		class TestFixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
			constructor(length: number) {
				super();
				lengths.push(length);
			}
		}
		vi.stubGlobal("FixedLengthStream", TestFixedLengthStream);
		const response = await handleDemo(request("download?known=1"));
		const reader = response.body?.getReader();
		await vi.advanceTimersByTimeAsync(80);
		expect((await reader?.read())?.value?.byteLength).toBe(16 * 1024);
		await reader?.cancel();
		await vi.advanceTimersByTimeAsync(0);
		expect(lengths).toEqual([256 * 1024]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("aborts an in-flight upload and cancels its pending reader", async () => {
		const controller = new AbortController();
		const cancel = vi.fn();
		const input = request("upload", {
			method: "POST",
			signal: controller.signal,
			body: new ReadableStream({ cancel }),
			...{ duplex: "half" },
		});
		const pending = expect(handleDemo(input)).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await pending;
		expect(cancel).toHaveBeenCalledOnce();
	});

	it("accepts JSON at exactly 16 KiB", async () => {
		const body = `${JSON.stringify({ name: "Ada" })}${" ".repeat(16 * 1024 - 14)}`;
		expect(new TextEncoder().encode(body).byteLength).toBe(16 * 1024);
		const response = await handleDemo(
			request("echo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
			})
		);
		expect(response.status).toBe(200);
	});

	it("supports the unprefixed handler path", async () => {
		expect((await handleDemo(new Request("https://example.test/api/examples/echo"))).status).toBe(200);
	});

	it.each<Record<string, string>>([
		{ Origin: "https://evil.test" },
		{ Origin: "null" },
		{ "Sec-Fetch-Site": "cross-site" },
		{ "Sec-Fetch-Site": "same-site" },
	])("rejects cross-origin metadata %j", async (headers) => {
		expect((await handleDemo(request("echo", { headers }))).status).toBe(403);
	});

	it("accepts same-origin metadata", async () => {
		expect(
			(
				await handleDemo(
					request("echo", { headers: { Origin: "https://example.test", "Sec-Fetch-Site": "same-origin" } })
				)
			).status
		).toBe(200);
	});

	it("rejects unknown actions and unsafe methods without reading the body", async () => {
		expect((await handleDemo(request("missing"))).status).toBe(404);
		const response = await handleDemo(request("upload"));
		expect(response.status).toBe(405);
		expect(response.headers.get("Allow")).toBe("POST");
		const input = request("retry", { method: "POST", body: "ignored" });
		expect((await handleDemo(input)).status).toBe(405);
		expect(input.bodyUsed).toBe(false);
		expect((await handleDemo(request("echo", { method: "OPTIONS" }))).status).toBe(405);
	});

	it("parses bounded JSON and strips unsafe or non-string fields", async () => {
		const response = await handleDemo(
			request("echo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Ada", message: { nested: true }, password: "secret" }),
			})
		);
		expect(await response.json()).toEqual({ data: { method: "POST", body: { name: "Ada" } } });
	});

	it.each(["{", "null", "[]", "42"])("rejects invalid JSON objects: %s", async (body) => {
		expect(
			(await handleDemo(request("echo", { method: "POST", headers: { "Content-Type": "application/json" }, body })))
				.status
		).toBe(400);
	});

	it("requires JSON media type and enforces actual JSON byte limits", async () => {
		expect((await handleDemo(request("echo", { method: "POST", body: "{}" }))).status).toBe(415);
		const cancel = vi.fn();
		const init = streamedBody([new Uint8Array(16 * 1024 + 1), new Uint8Array(1)], cancel);
		init.headers = { "Content-Type": "application/json", "Content-Length": "2" };
		expect((await handleDemo(request("echo", init))).status).toBe(413);
		expect(cancel).toHaveBeenCalledOnce();
	});

	it.each([400, 401, 404, 422, 429, 500, 503])("returns problem details for %i", async (code) => {
		const response = await handleDemo(request(`status?code=${code}`));
		expect(response.status).toBe(code);
		expect(response.headers.get("Content-Type")).toContain("application/problem+json");
		expect(await response.json()).toEqual({
			type: "about:blank",
			title: expect.any(String),
			status: code,
			detail: `Demonstration of HTTP ${code}.`,
		});
		expect(response.headers.get("Retry-After")).toBe([429, 503].includes(code) ? "1" : null);
	});

	it.each(["201", "422.5", "wat", "", "99999999999999999999"])("rejects invalid status %s", async (code) => {
		expect((await handleDemo(request(`status?code=${code}`))).status).toBe(400);
	});

	it("returns an enveloped successful status", async () => {
		expect(await (await handleDemo(request("status?code=200"))).json()).toEqual({ data: { status: 200 } });
	});

	it("uses stateless explicit retry attempts", async () => {
		for (const attempt of [1, 2, 3, 1]) {
			const response = await handleDemo(request("retry", { headers: { "X-Demo-Attempt": String(attempt) } }));
			expect(response.status).toBe(attempt === 3 ? 200 : 503);
			if (attempt === 3) {
				expect(await response.json()).toEqual({ data: { attempt } });
			} else {
				expect(response.headers.get("Retry-After")).toBe("0");
			}
		}
	});

	it.each(["0", "4", "1.5", "no"])("rejects invalid retry attempt %s", async (attempt) => {
		expect((await handleDemo(request("retry", { headers: { "X-Demo-Attempt": attempt } }))).status).toBe(400);
	});

	it("bounds delay and rejects malformed input", async () => {
		vi.useFakeTimers();
		for (const [input, waited] of [
			[1000, 1000],
			[-1, 0],
			[9000, 3000],
		]) {
			const pending = handleDemo(request(`delay?ms=${input}`));
			await vi.runAllTimersAsync();
			expect(await (await pending).json()).toEqual({ data: { waited } });
		}
		expect((await handleDemo(request("delay?ms=no"))).status).toBe(400);
	});

	it("aborts delay and clears its timer and listener", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const input = request("delay", { signal: controller.signal });
		const remove = vi.spyOn(input.signal, "removeEventListener");
		const pending = expect(handleDemo(input)).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await pending;
		expect(vi.getTimerCount()).toBe(0);
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	});

	it("counts and discards uploads at the exact limit", async () => {
		const init = streamedBody([new Uint8Array(512 * 1024), new Uint8Array(512 * 1024)]);
		init.headers = { "Content-Length": "1", "Content-Type": "application/octet-stream" };
		const response = await handleDemo(request("upload", init));
		expect(await response.json()).toEqual({
			data: { bytes: 1024 * 1024, contentType: "application/octet-stream", stored: false },
		});
	});

	it("cancels oversized uploads", async () => {
		const cancel = vi.fn();
		const response = await handleDemo(
			request("upload", streamedBody([new Uint8Array(1024 * 1024 + 1), new Uint8Array(1)], cancel))
		);
		expect(response.status).toBe(413);
		expect(cancel).toHaveBeenCalledOnce();
		expect(response.headers.has("Retry-After")).toBe(false);
	});

	it.each(["0", "1"])("streams exact download bytes with known=%s", async (known) => {
		vi.useFakeTimers();
		const response = await handleDemo(request(`download?known=${known}`));
		expect(response.headers.get("Content-Length")).toBe(known === "1" ? String(256 * 1024) : null);
		expect(response.headers.get("Content-Encoding")).toBe("identity");
		expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="demo.bin"');
		const reader = response.body?.getReader();
		for (let index = 0; index < 16; index += 1) {
			await vi.advanceTimersByTimeAsync(80);
			const chunk = await reader?.read();
			expect(chunk?.value).toEqual(new Uint8Array(16 * 1024).fill(index));
		}
		expect((await reader?.read())?.done).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("validates download parameters before stream headers", async () => {
		const response = await handleDemo(request("download?known=2"));
		expect(response.status).toBe(400);
		expect(response.headers.has("Content-Disposition")).toBe(false);
	});

	it("emits six NDJSON records then closes", async () => {
		vi.useFakeTimers();
		const response = await handleDemo(request("stream"));
		expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
		const text = response.text();
		await vi.advanceTimersByTimeAsync(1200);
		const records = (await text)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(records).toEqual(Array.from({ length: 6 }, (_, index) => ({ index, message: `Demo record ${index + 1}` })));
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(["stream", "download?known=0", "download?known=1"])(
		"cleans up on reader cancellation: %s",
		async (action) => {
			vi.useFakeTimers();
			const input = request(action);
			const remove = vi.spyOn(input.signal, "removeEventListener");
			const response = await handleDemo(input);
			await response.body?.cancel();
			expect(vi.getTimerCount()).toBe(0);
			expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
		}
	);

	it("errors a stream and removes timers on request abort", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const response = await handleDemo(request("stream", { signal: controller.signal }));
		const pending = expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await pending;
		expect(vi.getTimerCount()).toBe(0);
	});
});
