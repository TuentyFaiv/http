import type { HttpProgress, HttpProgressHandler } from "../typing/classes/http.typing.js";

const PERCENT = 100;
const DECIMAL_LENGTH = /^\d+$/;

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

function cloneWithMetadata(this: Response): Response {
	return preserveMetadata(Response.prototype.clone.call(this), this);
}

/** Keep native Response branding and preserve metadata through subsequent clones. */
function preserveMetadata(response: Response, source: Response): Response {
	Object.defineProperties(response, {
		url: { value: source.url },
		redirected: { value: source.redirected },
		type: { value: source.type },
		clone: { value: cloneWithMetadata, writable: true, configurable: true },
	});
	return response;
}

function contentLength(response: Response): number | undefined {
	const encoding = response.headers.get("Content-Encoding");
	if (response.type === "cors" && !encoding) {
		// CORS exposes Content-Length by default, but may hide an encoded representation's Content-Encoding.
		return undefined;
	}
	if (encoding && encoding.trim().toLowerCase() !== "identity") {
		// Fetch yields decoded bytes, while Content-Length describes the encoded representation.
		return undefined;
	}
	const header = response.headers.get("Content-Length")?.trim();
	if (!(header && DECIMAL_LENGTH.test(header))) {
		return undefined;
	}
	const length = Number(header);
	return Number.isSafeInteger(length) && length > 0 ? length : undefined;
}

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

	const total = contentLength(response);
	const reader = response.body.getReader();

	let loaded = 0;
	let ended = false;

	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (ended) {
					return;
				}
				if (done) {
					onProgress(toProgress(loaded, total, true));
					ended = true;
					reader.releaseLock();
					controller.close();
					return;
				}

				loaded += value.byteLength;
				onProgress(toProgress(loaded, total, false));
				if (!ended) {
					controller.enqueue(value);
				}
			} catch (error) {
				if (!ended) {
					ended = true;
					// Cancellation may wait for a tee sibling; do not block reporting the original error.
					reader.cancel(error).catch(() => {
						// Cleanup must not replace the read or progress callback error.
					});
					reader.releaseLock();
					controller.error(error);
				}
			}
		},

		cancel(reason) {
			ended = true;
			const cancelled = reader.cancel(reason);
			reader.releaseLock();
			return cancelled;
		},
	});

	return preserveMetadata(
		new Response(stream, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		}),
		response
	);
}
