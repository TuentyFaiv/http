import type { HttpProgress, HttpProgressHandler } from "../typing/classes/http.typing.js";

const PERCENT = 100;

const STATUS_SWITCHING_PROTOCOLS = 101;
const STATUS_EARLY_HINTS = 103;
const STATUS_NO_CONTENT = 204;
const STATUS_RESET_CONTENT = 205;
const STATUS_NOT_MODIFIED = 304;

/** Statuses the Response constructor refuses to pair with a body. */
const NULL_BODY = new Set([
	STATUS_SWITCHING_PROTOCOLS,
	STATUS_EARLY_HINTS,
	STATUS_NO_CONTENT,
	STATUS_RESET_CONTENT,
	STATUS_NOT_MODIFIED,
]);

function toProgress(loaded: number, total: number | undefined, done: boolean): HttpProgress {
	return {
		loaded,
		total,
		percent: total ? Math.min(PERCENT, (loaded / total) * PERCENT) : undefined,
		done,
	};
}

/**
 * Returns an equivalent Response whose body reports bytes as they arrive.
 * Counting happens upstream of any `clone()`, so each chunk is reported once
 * no matter how many branches read it.
 */
export function withProgress(response: Response, onProgress: HttpProgressHandler): Response {
	if (!response.body || NULL_BODY.has(response.status)) {
		onProgress(toProgress(0, 0, true));

		return response;
	}

	const header = Number(response.headers.get("Content-Length"));
	const total = Number.isFinite(header) && header > 0 ? header : undefined;
	const reader = response.body.getReader();

	let loaded = 0;

	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();

			if (done) {
				controller.close();
				onProgress(toProgress(loaded, total, true));

				return;
			}

			loaded += value.byteLength;
			onProgress(toProgress(loaded, total, false));
			controller.enqueue(value);
		},

		cancel(reason) {
			return reader.cancel(reason);
		},
	});

	return new Response(stream, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}
