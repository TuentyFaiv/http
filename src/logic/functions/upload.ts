import type { HttpProgress } from "../typing/classes/http.typing.js";

const DEFAULT_CHUNK_SIZE = 262_144;
const PERCENT = 100;

export interface HttpUploadChunkContext {
	offset: number;
	total: number;
	signal?: AbortSignal;
}

export interface HttpUploadChunkReceipt {
	/** Bytes acknowledged by the server for this chunk, not a cumulative count. */
	receivedBytes: number;
}

export interface HttpConfirmedUploadProgress extends HttpProgress {
	/** Known file byte count; unlike download progress, this is always available. */
	total: number;
	percent: number;
}

export interface HttpConfirmedUploadOptions {
	/** Maximum chunk size in bytes. Defaults to 256 KiB. */
	chunkSize?: number;
	/** Send one chunk using Fetch and return its server acknowledgement. No automatic retries. */
	sendChunk: (chunk: Blob, context: HttpUploadChunkContext) => HttpUploadChunkReceipt | Promise<HttpUploadChunkReceipt>;
	onUploadProgress?: (progress: HttpConfirmedUploadProgress) => void;
	/** The sender must respect this signal to cancel the actual network request. */
	signal?: AbortSignal;
}

export interface HttpConfirmedUploadResult {
	receivedBytes: number;
	total: number;
	chunks: number;
}

function checkAbort(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw signal.reason;
	}
}

/** Stop waiting even when the sender does not cooperate with cancellation. */
async function sendWithAbort(
	send: () => HttpUploadChunkReceipt | Promise<HttpUploadChunkReceipt>,
	signal?: AbortSignal
): Promise<HttpUploadChunkReceipt> {
	checkAbort(signal);
	if (!signal) {
		return send();
	}

	let onAbort: (() => void) | undefined;
	try {
		return await new Promise<HttpUploadChunkReceipt>((resolve, reject) => {
			onAbort = () => reject(signal.reason);
			signal.addEventListener("abort", onAbort, { once: true });
			checkAbort(signal);
			// Both handlers remain attached to consume late sender results after abort.
			Promise.resolve(send()).then(resolve, reject);
		});
	} finally {
		if (onAbort) {
			signal.removeEventListener("abort", onAbort);
		}
	}
}

function acknowledgedBytes(receipt: HttpUploadChunkReceipt, expected: number): number {
	if (receipt === null || typeof receipt !== "object") {
		throw new TypeError("uploadConfirmed receipt must contain receivedBytes");
	}
	const acknowledged = receipt.receivedBytes;
	if (!Number.isSafeInteger(acknowledged) || acknowledged < 0) {
		throw new TypeError("uploadConfirmed receipt receivedBytes must be a safe nonnegative integer");
	}
	if (acknowledged !== expected) {
		throw new RangeError("uploadConfirmed receipt receivedBytes must equal the chunk size");
	}
	return acknowledged;
}

/**
 * Send a Blob/File sequentially, reporting only bytes acknowledged by the server.
 * The sender owns the endpoint protocol and retry/idempotency policy. Completion
 * confirms byte receipts, not business acceptance or final file processing.
 * An empty body still requires one acknowledged empty chunk.
 */
export async function uploadConfirmed(
	body: Blob,
	options: HttpConfirmedUploadOptions
): Promise<HttpConfirmedUploadResult> {
	const { chunkSize = DEFAULT_CHUNK_SIZE, sendChunk, onUploadProgress, signal } = options;
	checkAbort(signal);
	if (!(body instanceof Blob)) {
		throw new TypeError("uploadConfirmed body must be a Blob or File");
	}
	if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
		throw new RangeError("uploadConfirmed chunkSize must be a safe positive integer");
	}
	if (typeof sendChunk !== "function") {
		throw new TypeError("uploadConfirmed sendChunk must be a function");
	}

	const total = body.size;
	if (!Number.isSafeInteger(total) || total < 0) {
		throw new RangeError("uploadConfirmed body size must be a safe nonnegative integer");
	}
	let receivedBytes = 0;
	let chunks = 0;
	checkAbort(signal);
	onUploadProgress?.({ loaded: 0, total, percent: 0, done: false });

	do {
		checkAbort(signal);
		const chunk = body.slice(receivedBytes, receivedBytes + chunkSize);
		if (chunk.size !== Math.min(chunkSize, total - receivedBytes)) {
			throw new RangeError("uploadConfirmed Blob slice does not match its declared size");
		}
		// biome-ignore lint/performance/noAwaitInLoops: each chunk requires acknowledgement before the next send
		const receipt = await sendWithAbort(() => {
			checkAbort(signal);
			return sendChunk(chunk, { offset: receivedBytes, total, signal });
		}, signal);
		checkAbort(signal);
		receivedBytes += acknowledgedBytes(receipt, chunk.size);
		chunks += 1;
		const done = receivedBytes === total;
		checkAbort(signal);
		onUploadProgress?.({
			loaded: receivedBytes,
			total,
			percent: done ? PERCENT : (receivedBytes / total) * PERCENT,
			done,
		});
		checkAbort(signal);
	} while (receivedBytes < total);

	return { receivedBytes, total, chunks };
}
