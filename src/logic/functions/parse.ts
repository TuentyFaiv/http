import type { HttpConfigConnection } from "../typing/classes/http.typing.js";
import type { ContentTypes } from "../typing/enums/content.js";

import { ContentType } from "../typing/enums/content.js";

/**
 * Normalizes any HeadersInit. A `Headers` instance has no own enumerable
 * properties so it cannot be spread, plain objects may carry undefined values,
 * and a caller-supplied Content-Type must survive the default.
 */
export function parseHeaders(init?: HeadersInit): Headers {
	const headers = new Headers();

	if (init instanceof Headers || Array.isArray(init)) {
		for (const [key, value] of new Headers(init).entries()) {
			headers.set(key, value);
		}
	} else if (init) {
		for (const [key, value] of Object.entries(init)) {
			if (value !== undefined && value !== null) {
				headers.set(key, value);
			}
		}
	}

	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", ContentType.APPLICATION_JSON);
	}

	return headers;
}

export interface ParsedBody {
	body?: BodyInit;
	headers: Headers;
}

function isNativeBody(value: unknown): value is BodyInit {
	return (
		typeof value === "string" ||
		value instanceof Blob ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		value instanceof ReadableStream
	);
}

function toFormData(source: unknown): FormData {
	const parsedBody = new FormData();

	const addItem = (key: string, value: unknown, index?: number) => {
		const name = index === undefined ? key : `${key}[${index}]`;

		if (value instanceof File) {
			parsedBody.append(name, value, value.name);
			return;
		}

		if (value instanceof Blob) {
			parsedBody.append(name, value);
			return;
		}

		if (typeof value === "string") {
			parsedBody.append(name, value);
			return;
		}

		if (typeof value === "number" || typeof value === "boolean") {
			parsedBody.append(name, value.toString());
			return;
		}

		if (typeof value === "object") {
			parsedBody.append(name, JSON.stringify(value));
		}
	};

	for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
		if (Array.isArray(value)) {
			for (const [index, item] of (value as unknown[]).entries()) {
				addItem(key, item, index);
			}
			continue;
		}

		addItem(key, value);
	}

	return parsedBody;
}

/**
 * Native fetch bodies are passed through untouched; only plain objects are
 * serialized. FormData never carries an explicit Content-Type so the runtime
 * can generate the multipart boundary.
 */
export function parseBody<T, P>(config: HttpConfigConnection<T, P>): ParsedBody {
	const { body, headers } = config;
	const declared = headers.get("Content-Type") as ContentTypes | null;

	if (body === undefined || body === null) {
		return { body: undefined, headers };
	}

	if (body instanceof FormData) {
		headers.delete("Content-Type");

		return { body, headers };
	}

	if (declared === ContentType.APPLICATION_FORM_DATA) {
		headers.delete("Content-Type");

		return { body: toFormData(body), headers };
	}

	if (body instanceof URLSearchParams) {
		if (!declared || declared === ContentType.APPLICATION_JSON) {
			headers.set("Content-Type", ContentType.APPLICATION_FORM_URLENCODED);
		}

		return { body, headers };
	}

	if (isNativeBody(body)) {
		return { body, headers };
	}

	if (!declared) {
		headers.set("Content-Type", ContentType.APPLICATION_JSON);
	}

	return { body: JSON.stringify(body), headers };
}
