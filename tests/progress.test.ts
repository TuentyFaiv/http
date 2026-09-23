import { describe, expect, it } from "vitest";

import type { HttpProgress } from "../src/index.js";

import { Http, withProgress } from "../src/index.js";
import { recorder } from "./helpers.js";

const encoder = new TextEncoder();

function streamResponse(chunks: string[], init?: ResponseInit) {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});

	return new Response(stream, { status: 200, ...init });
}

function jsonChunks(value: unknown) {
	const body = JSON.stringify(value);

	return {
		chunks: [body.slice(0, 5), body.slice(5)],
		length: encoder.encode(body).byteLength,
	};
}

describe("download progress", () => {
	it("reports bytes as they arrive and still parses the payload", async () => {
		const { chunks, length } = jsonChunks({ data: { id: 1 } });
		const events: HttpProgress[] = [];

		const { fetch } = recorder(() =>
			streamResponse(chunks, {
				headers: {
					"Content-Type": "application/json",
					"Content-Length": String(length),
				},
			})
		);
		const api = Http.create("https://progress-1.test", { fetch });

		const result = await api.get<{ id: number }>("/users/1", {
			onDownloadProgress: (progress) => events.push(progress),
		});

		expect(result.payload).toEqual({ id: 1 });
		expect(events.at(-1)).toMatchObject({ loaded: length, total: length, done: true });
		expect(events.at(-1)?.percent).toBe(100);
		expect(events.filter((event) => !event.done).length).toBeGreaterThan(1);
	});

	it("increases loaded monotonically", async () => {
		const { chunks, length } = jsonChunks({ data: { id: 1 } });
		const events: HttpProgress[] = [];

		const { fetch } = recorder(() =>
			streamResponse(chunks, {
				headers: {
					"Content-Type": "application/json",
					"Content-Length": String(length),
				},
			})
		);
		const api = Http.create("https://progress-2.test", { fetch });

		await api.get("/users/1", { onDownloadProgress: (progress) => events.push(progress) });

		const loaded = events.map((event) => event.loaded);

		expect([...loaded].sort((a, b) => a - b)).toEqual(loaded);
	});

	it("omits total and percent without a Content-Length", async () => {
		const events: HttpProgress[] = [];
		const { fetch } = recorder(() =>
			streamResponse(["hello ", "world"], {
				headers: { "Content-Type": "text/plain" },
			})
		);
		const api = Http.create("https://progress-3.test", { fetch });

		const result = await api.get<string>("/readme.txt", {
			onDownloadProgress: (progress) => events.push(progress),
		});

		expect(result.payload).toBe("hello world");
		expect(events.at(-1)).toMatchObject({ total: undefined, percent: undefined, done: true });
	});

	it("works for binary responses", async () => {
		const events: HttpProgress[] = [];
		const { fetch } = recorder(() =>
			streamResponse(["binary-chunk"], {
				headers: { "Content-Type": "image/png" },
			})
		);
		const api = Http.create("https://progress-4.test", { fetch });

		const result = await api.get<Blob>("/avatar.png", {
			onDownloadProgress: (progress) => events.push(progress),
		});

		expect(result.payload).toBeInstanceOf(Blob);
		expect(events.at(-1)?.done).toBe(true);
	});

	it("reports a single completed event for an empty response", async () => {
		const events: HttpProgress[] = [];
		const { fetch } = recorder(() => new Response(null, { status: 204 }));
		const api = Http.create("https://progress-5.test", { fetch });

		await api.delete("/users/1", undefined, {
			onDownloadProgress: (progress) => events.push(progress),
		});

		expect(events).toEqual([{ loaded: 0, total: 0, percent: undefined, done: true }]);
	});

	it("leaves the cloned response readable", async () => {
		const { chunks, length } = jsonChunks({ data: { id: 1 } });
		const { fetch } = recorder(() =>
			streamResponse(chunks, {
				headers: {
					"Content-Type": "application/json",
					"Content-Length": String(length),
				},
			})
		);
		const api = Http.create("https://progress-6.test", { fetch });

		const result = await api.get("/users/1", { onDownloadProgress: () => {} });

		await expect(result.response.json()).resolves.toEqual({ data: { id: 1 } });
	});
});

describe("withProgress", () => {
	it("preserves status, statusText and headers", async () => {
		const wrapped = withProgress(
			new Response("body", { status: 201, statusText: "Created", headers: { "X-Test": "1" } }),
			() => {}
		);

		expect(wrapped.status).toBe(201);
		expect(wrapped.statusText).toBe("Created");
		expect(wrapped.headers.get("X-Test")).toBe("1");
		await expect(wrapped.text()).resolves.toBe("body");
	});
});
