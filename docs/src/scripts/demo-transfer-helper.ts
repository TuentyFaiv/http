import type { HttpUploadChunkReceipt } from "../../../src/helpers.js";
import type { DemoContext } from "./demo-request-helper.js";

import { uploadConfirmed } from "../../../src/helpers.js";
import { bare, ContentType, envelope, Http } from "../../../src/index.js";

const FILE_LIMIT = 1_048_576;
const FIELD_LIMIT = 100;
const STREAM_LIMIT = 65_536;
const LINE_LIMIT = 4096;
const RECORD_LIMIT = 64;
async function uploadDemo(context: DemoContext) {
	const file = context.form.get("file");
	if (!(file instanceof File) || file.size > FILE_LIMIT || !file.name) {
		throw new Error(context.text.fileLimit);
	}
	const api = Http.create(context.base, { cache: false, secure: false, preset: bare });
	context.log(context.text.uploading);
	const receipt = await api.post("upload/", file, {
		signal: context.signal,
		type: ContentType.APPLICATION_OCTET_STREAM,
	});
	context.log(context.text.receipt);
	return receipt;
}
async function multipartDemo(context: DemoContext) {
	const file = context.form.get("file");
	if (!(file instanceof File) || file.size > FILE_LIMIT || !file.name) {
		throw new Error(context.text.fileLimit);
	}
	const body = new FormData();
	body.set("file", file);
	body.set("name", String(context.form.get("name") ?? "").slice(0, FIELD_LIMIT));
	const api = Http.create(context.base, { cache: false, secure: false, preset: bare });
	context.log(context.text.uploading);
	// Fetch supplies the multipart boundary; do not set Content-Type manually.
	return await api.post("multipart/", body, { signal: context.signal });
}
async function confirmedUploadDemo(context: DemoContext) {
	const size = Number(context.form.get("confirmedSize") ?? FILE_LIMIT);
	if (!Number.isSafeInteger(size) || size < 0 || size > FILE_LIMIT) {
		throw new Error(context.text.confirmedSizeLimit);
	}
	const body = new Blob([new Uint8Array(size)]);
	const api = Http.create(context.base, { cache: false, secure: false, preset: envelope });
	const summary = await uploadConfirmed(body, {
		signal: context.signal,
		async sendChunk(chunk, { signal, offset }) {
			const { payload } = await api.post<Blob, HttpUploadChunkReceipt>("upload-chunk/", chunk, {
				signal,
				type: ContentType.APPLICATION_OCTET_STREAM,
				retry: 0,
			});
			context.log(`${context.text.receipt}: ${offset} + ${payload.receivedBytes} ${context.text.bytes}`);
			return payload;
		},
		onUploadProgress({ loaded, total, done }) {
			context.progress(loaded, total, done);
		},
	});
	context.log(context.text.confirmedReceipt);
	return { ...summary, stored: false };
}
async function downloadDemo(context: DemoContext) {
	const api = Http.create(context.base, { cache: false, secure: false, preset: bare });
	const blob = await api.get<Blob, { known: string }>("download", {
		signal: context.signal,
		params: { known: context.form.has("known") ? "1" : "0" },
		responseType: "blob",
		onDownloadProgress: ({ loaded, total, done }) => {
			context.progress(loaded, total, done);
		},
	});
	context.signal.throwIfAborted();
	context.download?.(blob);
	return { bytes: blob.size, contentType: blob.type };
}
function record(line: string, context: DemoContext): unknown {
	if (line.length > LINE_LIMIT) {
		throw new Error(context.text.streamLimit);
	}
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		throw new Error(context.text.streamInvalid);
	}
	if (
		typeof value !== "object" ||
		value === null ||
		!("index" in value) ||
		!("message" in value) ||
		!Number.isInteger(value.index) ||
		typeof value.message !== "string"
	) {
		throw new Error(context.text.streamInvalid);
	}
	return value;
}
async function streamDemo(context: DemoContext) {
	const api = Http.create(context.base, { cache: false, secure: false, preset: bare });
	const stream = await api.get<ReadableStream<Uint8Array> | null>("stream", {
		signal: context.signal,
		responseType: "stream",
	});
	if (!stream) {
		throw new Error(context.text.noStream);
	}
	const reader = stream.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const records: unknown[] = [];
	let pending = "";
	let bytes = 0;
	const consume = (line: string) => {
		if (!line.trim()) {
			return;
		}
		if (records.length >= RECORD_LIMIT) {
			throw new Error(context.text.streamLimit);
		}
		records.push(record(line, context));
		context.result(records);
		context.log(`${records.length} ${context.text.records}`);
	};
	const cancel = () => {
		reader.cancel().catch(() => {
			/* The request's abort error is reported by the runner. */
		});
	};
	context.signal.addEventListener("abort", cancel, { once: true });
	try {
		context.signal.throwIfAborted();
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: sequential reads preserve stream order and backpressure
			const { value, done } = await reader.read();
			context.signal.throwIfAborted();
			bytes += value?.byteLength ?? 0;
			if (bytes > STREAM_LIMIT) {
				throw new Error(context.text.streamLimit);
			}
			pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
			let newline = pending.indexOf("\n");
			while (newline !== -1) {
				consume(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
				newline = pending.indexOf("\n");
			}
			if (pending.length > LINE_LIMIT) {
				throw new Error(context.text.streamLimit);
			}
			if (done) {
				consume(pending);
				break;
			}
		}
		return records;
	} finally {
		context.signal.removeEventListener("abort", cancel);
		try {
			await reader.cancel().catch(() => {
				/* Preserve the original read/parse error if cancellation also fails. */
			});
		} finally {
			reader.releaseLock();
		}
	}
}

export { confirmedUploadDemo, downloadDemo, multipartDemo, streamDemo, uploadDemo };
