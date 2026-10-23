import { once } from "node:events";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { HttpProgress } from "../src/index.js";

import { bare, Http, uploadConfirmed } from "../src/index.js";

const payload = "x".repeat(65_536);
const compressed = gzipSync(payload);
let origin = "";
const server = createServer((request, response) => {
	if (request.url === "/redirect") {
		response.writeHead(302, { Location: "/compressed" });
		response.end();
		return;
	}
	if (request.url === "/compressed") {
		response.writeHead(200, {
			"Content-Type": "text/plain",
			"Content-Encoding": "gzip",
			"Content-Length": String(compressed.length),
		});
		response.end(compressed);
		return;
	}
	const receive = async () => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(Buffer.from(chunk));
		}
		const bytes = Buffer.concat(chunks);
		let result: unknown = { bytes: bytes.length };
		if (request.url === "/upload-chunk") {
			result = { receivedBytes: bytes.length };
		}
		if (request.url === "/multipart") {
			const parsed = await new Request(`${origin}/multipart`, {
				method: "POST",
				headers: { "Content-Type": request.headers["content-type"] ?? "" },
				body: bytes,
			}).formData();
			const file = parsed.get("file");
			result = { field: parsed.get("name"), fileBytes: file instanceof File ? file.size : undefined };
		}
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(result));
	};
	receive().catch(() => {
		response.writeHead(500);
		response.end();
	});
});

beforeAll(async () => {
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!(address && typeof address === "object")) {
		throw new Error("Local server did not start");
	}
	origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("native Fetch transfers", () => {
	it("confirms real server byte receipts while reusing the same client", async () => {
		const api = Http.create(origin, { cache: false, preset: bare });
		const events: HttpProgress[] = [];
		const result = await uploadConfirmed(new Blob(["confirmed upload"]), {
			chunkSize: 4,
			sendChunk: (chunk, { signal }) =>
				api.post<Blob, { receivedBytes: number }>("/upload-chunk", chunk, {
					signal,
					retry: 0,
					headers: { "Content-Type": "application/octet-stream" },
				}),
			onUploadProgress: (event) => events.push(event),
		});
		expect(result).toEqual({ receivedBytes: 16, total: 16, chunks: 4 });
		expect(events.map(({ loaded }) => loaded)).toEqual([0, 4, 8, 12, 16]);
		expect(events.at(-1)).toEqual({ loaded: 16, total: 16, percent: 100, done: true });
	});

	it("preserves redirect metadata and uses indeterminate progress for compressed downloads", async () => {
		const events: HttpProgress[] = [];
		const api = Http.create(origin, { cache: false });
		const result = await api.get("/redirect", {
			responseType: "text",
			onDownloadProgress: (event) => events.push(event),
		});
		const clone = result.response.clone();

		expect(result.payload).toBe(payload);
		expect(result.response.url).toBe(`${origin}/compressed`);
		expect(clone.url).toBe(result.response.url);
		expect(result.response.redirected).toBe(true);
		expect(clone.redirected).toBe(true);
		expect(result.response.type).toBe("basic");
		expect(clone.type).toBe("basic");
		expect(events.at(-1)?.loaded).toBe(payload.length);
		expect(events.every((event) => event.total === undefined && event.percent === undefined)).toBe(true);
		await expect(Promise.all([result.response.text(), clone.text()])).resolves.toEqual([payload, payload]);
	});

	it("uploads a ReadableStream with automatic half duplex", async () => {
		const api = Http.create(origin, { cache: false, preset: bare });
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("streamed upload"));
				controller.close();
			},
		});
		const result = await api.post<ReadableStream<Uint8Array>, { bytes: number }>("/upload", stream);
		expect(result.bytes).toBe(15);
	});

	it("uploads multipart files and fields with a native Fetch-generated boundary", async () => {
		const api = Http.create(origin, { cache: false, preset: bare });
		const form = new FormData();
		form.append("name", "Ada");
		form.append("file", new File(["file body"], "demo.txt"));
		const result = await api.post<FormData, { field: string; fileBytes: number }>("/multipart", form);

		expect(result).toEqual({ field: "Ada", fileBytes: 9 });
	});
});
