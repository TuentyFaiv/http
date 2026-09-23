const KIB = 1024;
const JSON_LIMIT = 16_384;
const UPLOAD_LIMIT = KIB * KIB;
const DOWNLOAD_SIZE = 262_144;
const DOWNLOAD_CHUNKS = 16;
const DOWNLOAD_INTERVAL = 80;
const STREAM_RECORDS = 6;
const STREAM_INTERVAL = 200;
const MAX_DELAY = 3000;
const DEFAULT_DELAY = 1000;
const FINAL_ATTEMPT = 3;
const OK = 200;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;
const TOO_LARGE = 413;
const UNSUPPORTED_MEDIA = 415;
const UNAVAILABLE = 503;
const UNAUTHORIZED = 401;
const UNPROCESSABLE = 422;
const RATE_LIMITED = 429;
const INTERNAL_ERROR = 500;
const TITLES = new Map([
	[OK, "OK"],
	[BAD_REQUEST, "Bad Request"],
	[UNAUTHORIZED, "Unauthorized"],
	[FORBIDDEN, "Forbidden"],
	[NOT_FOUND, "Not Found"],
	[METHOD_NOT_ALLOWED, "Method Not Allowed"],
	[TOO_LARGE, "Content Too Large"],
	[UNSUPPORTED_MEDIA, "Unsupported Media Type"],
	[UNPROCESSABLE, "Unprocessable Content"],
	[RATE_LIMITED, "Too Many Requests"],
	[INTERNAL_ERROR, "Internal Server Error"],
	[UNAVAILABLE, "Service Unavailable"],
]);
const STATUS_CODES = new Set([
	OK,
	BAD_REQUEST,
	UNAUTHORIZED,
	NOT_FOUND,
	UNPROCESSABLE,
	RATE_LIMITED,
	INTERNAL_ERROR,
	UNAVAILABLE,
]);
const RETRY_CODES = new Set([RATE_LIMITED, UNAVAILABLE]);
const SAFE_FIELDS = ["name", "message"];
const INTEGER = /^-?\d+$/;
const ACTION_PATH = /^\/(?:http\/)?api\/examples\/([^/]+)\/?$/;
const BASE_HEADERS = {
	"Cache-Control": "no-store, no-transform",
	"Cross-Origin-Resource-Policy": "same-origin",
	"X-Content-Type-Options": "nosniff",
};

function success(data: unknown): Response {
	return Response.json({ data }, { headers: BASE_HEADERS });
}

function problem(status: number, detail: string, extra?: HeadersInit): Response {
	const headers = new Headers(BASE_HEADERS);
	headers.set("Content-Type", "application/problem+json");
	for (const [key, value] of new Headers(extra)) {
		headers.set(key, value);
	}
	return Response.json({ type: "about:blank", title: TITLES.get(status), status, detail }, { status, headers });
}

function sameOrigin(request: Request, url: URL): boolean {
	const origin = request.headers.get("Origin");
	const site = request.headers.get("Sec-Fetch-Site");
	return (origin === null || origin === url.origin) && (site === null || site === "same-origin" || site === "none");
}

function integer(value: string | null, fallback: number): number | undefined {
	if (value === null) {
		return fallback;
	}
	if (!INTEGER.test(value)) {
		return;
	}
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function safeFields(value: Record<string, unknown>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const field of SAFE_FIELDS) {
		if (typeof value[field] === "string") {
			result[field] = value[field];
		}
	}
	return result;
}

class BodyLimitError extends Error {}

async function readBody(
	request: Request,
	limit: number,
	collect: boolean
): Promise<{ bytes: number; chunks: Uint8Array[] }> {
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	const reader = request.body?.getReader();
	if (!reader) {
		return { bytes, chunks };
	}
	const abort = () => {
		void reader.cancel().catch(() => undefined);
	};
	request.signal.addEventListener("abort", abort, { once: true });
	try {
		request.signal.throwIfAborted();
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: Read sequentially to enforce the byte cap without buffering the upload.
			const { done, value } = await reader.read();
			request.signal.throwIfAborted();
			if (done) {
				return { bytes, chunks };
			}
			bytes += value.byteLength;
			if (bytes > limit) {
				void reader.cancel().catch(() => undefined);
				throw new BodyLimitError("Request body exceeds the demo limit.");
			}
			if (collect) {
				chunks.push(value);
			}
		}
	} finally {
		request.signal.removeEventListener("abort", abort);
		reader.releaseLock();
	}
}

async function echo(request: Request, url: URL): Promise<Response> {
	if (request.method === "GET") {
		const query = safeFields(Object.fromEntries(url.searchParams));
		return success({ name: query.name ?? "", method: request.method, query });
	}
	if (request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
		return problem(UNSUPPORTED_MEDIA, "Send application/json.");
	}
	const { bytes, chunks } = await readBody(request, JSON_LIMIT, true);
	const buffer = new Uint8Array(bytes);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.byteLength;
	}
	let body: unknown;
	try {
		body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
	} catch {
		return problem(BAD_REQUEST, "Send valid UTF-8 JSON.");
	}
	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		return problem(BAD_REQUEST, "Send a JSON object with optional string name and message fields.");
	}
	return success({ method: request.method, body: safeFields(body as Record<string, unknown>) });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const abort = () => {
			globalThis.clearTimeout(timer);
			signal.removeEventListener("abort", abort);
			reject(new DOMException("Request aborted", "AbortError"));
		};
		const timer = globalThis.setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, ms);
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) {
			abort();
		}
	});
}

function timedStream(
	signal: AbortSignal,
	options: { count: number; interval: number; chunk: (index: number) => Uint8Array }
): ReadableStream<Uint8Array> {
	let cleanup: () => void = () => undefined;
	return new ReadableStream<Uint8Array>({
		start(controller) {
			let index = 0;
			let timer: ReturnType<typeof globalThis.setTimeout>;
			const abort = () => {
				cleanup();
				controller.error(new DOMException("Request aborted", "AbortError"));
			};
			cleanup = () => {
				globalThis.clearTimeout(timer);
				signal.removeEventListener("abort", abort);
			};
			const emit = () => {
				controller.enqueue(options.chunk(index));
				index += 1;
				if (index === options.count) {
					cleanup();
					controller.close();
				} else {
					timer = globalThis.setTimeout(emit, options.interval);
				}
			};
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) {
				abort();
			} else {
				timer = globalThis.setTimeout(emit, options.interval);
			}
		},
		cancel() {
			cleanup();
		},
	});
}

type FixedLengthConstructor = new (
	length: number
) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

function download(request: Request, url: URL): Response {
	const known = url.searchParams.get("known") ?? "0";
	if (known !== "0" && known !== "1") {
		return problem(BAD_REQUEST, "known must be 0 or 1.");
	}
	let body = timedStream(request.signal, {
		count: DOWNLOAD_CHUNKS,
		interval: DOWNLOAD_INTERVAL,
		chunk: (index) => new Uint8Array(DOWNLOAD_SIZE / DOWNLOAD_CHUNKS).fill(index),
	});
	const headers = new Headers(BASE_HEADERS);
	headers.set("Content-Type", "application/octet-stream");
	headers.set("Content-Disposition", 'attachment; filename="demo.bin"');
	headers.set("Content-Encoding", "identity");
	if (known === "1") {
		headers.set("Content-Length", String(DOWNLOAD_SIZE));
		const fixedLengthStream = (
			globalThis as typeof globalThis & Partial<Record<"FixedLengthStream", FixedLengthConstructor>>
		).FixedLengthStream;
		if (fixedLengthStream) {
			const fixed = new fixedLengthStream(DOWNLOAD_SIZE);
			// The readable reports pipe failures; consuming this rejection prevents an unhandled rejection on cancellation.
			void body.pipeTo(fixed.writable).catch(() => undefined);
			body = fixed.readable;
		}
	}
	return new Response(body, { headers });
}

function statusResponse(url: URL): Response {
	const code = integer(url.searchParams.get("code"), OK);
	if (code === undefined || !STATUS_CODES.has(code)) {
		return problem(BAD_REQUEST, "Unsupported demo status code.");
	}
	if (code === OK) {
		return success({ status: code });
	}
	return problem(code, `Demonstration of HTTP ${code}.`, RETRY_CODES.has(code) ? { "Retry-After": "1" } : undefined);
}

async function dispatch(action: string, request: Request, url: URL): Promise<Response> {
	switch (action) {
		case "echo":
			return echo(request, url);
		case "status":
			return statusResponse(url);
		case "delay": {
			const parsed = integer(url.searchParams.get("ms"), DEFAULT_DELAY);
			if (parsed === undefined) {
				return problem(BAD_REQUEST, "ms must be a safe integer.");
			}
			const ms = Math.min(MAX_DELAY, Math.max(0, parsed));
			await wait(ms, request.signal);
			return success({ waited: ms });
		}
		case "retry": {
			const attempt = integer(request.headers.get("X-Demo-Attempt"), 1);
			if (attempt === undefined || attempt < 1 || attempt > FINAL_ATTEMPT) {
				return problem(BAD_REQUEST, "X-Demo-Attempt must be an integer from 1 to 3.");
			}
			return attempt === FINAL_ATTEMPT
				? success({ attempt })
				: problem(UNAVAILABLE, "Try the next demo attempt.", { "Retry-After": "0" });
		}
		case "upload": {
			const { bytes } = await readBody(request, UPLOAD_LIMIT, false);
			return success({
				bytes,
				contentType: request.headers.get("Content-Type") ?? "application/octet-stream",
				stored: false,
			});
		}
		case "download":
			return download(request, url);
		case "stream": {
			const encoder = new TextEncoder();
			return new Response(
				timedStream(request.signal, {
					count: STREAM_RECORDS,
					interval: STREAM_INTERVAL,
					chunk: (index) => encoder.encode(`${JSON.stringify({ index, message: `Demo record ${index + 1}` })}\n`),
				}),
				{ headers: { ...BASE_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" } }
			);
		}
		default:
			return problem(NOT_FOUND, "Unknown demo action.");
	}
}

const METHODS = new Map([
	["echo", ["GET", "POST"]],
	["status", ["GET"]],
	["delay", ["GET"]],
	["retry", ["GET"]],
	["upload", ["POST"]],
	["download", ["GET"]],
	["stream", ["GET"]],
]);

async function handleDemo(request: Request): Promise<Response> {
	const url = new URL(request.url);
	if (!sameOrigin(request, url)) {
		return problem(FORBIDDEN, "Only same-origin demo requests are allowed.");
	}
	const action = ACTION_PATH.exec(url.pathname)?.[1] ?? "";
	const methods = METHODS.get(action);
	if (!methods) {
		return problem(NOT_FOUND, "Unknown demo action.");
	}
	if (!methods.includes(request.method)) {
		return problem(METHOD_NOT_ALLOWED, "Method not allowed for this demo.", { allow: methods.join(", ") });
	}
	request.signal.throwIfAborted();
	try {
		return await dispatch(action, request, url);
	} catch (error) {
		if (error instanceof BodyLimitError) {
			return problem(TOO_LARGE, error.message);
		}
		throw error;
	}
}

export { handleDemo };
