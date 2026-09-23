import type { HttpParamsSerializer } from "../typing/classes/preset.typing.js";

const ABSOLUTE = /^([a-z][a-z\d+\-.]*:)?\/\//i;
const TRAILING_SLASHES = /\/+$/;
const LEADING_SLASHES = /^\/+/;
const LEADING_SLASH = /^\//;

/** Lets `URL` resolve endpoints that have no base, e.g. the default instance. */
const RELATIVE_BASE = "http://relative.invalid";

export interface BuildUrlOptions {
	baseUrl?: string;
	endpoint: string;
	params?: Record<string, unknown>;
	serializer?: HttpParamsSerializer;
}

export function isAbsolute(url: string): boolean {
	return ABSOLUTE.test(url);
}

function toParamValue(value: unknown): string | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return JSON.stringify(value);
}

/** Arrays repeat the key (`tag=a&tag=b`); objects are serialized as JSON. */
export function serializeParams(params: Record<string, unknown>): string {
	const search = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		const values = Array.isArray(value) ? value : [value];

		for (const item of values) {
			const parsed = toParamValue(item);

			if (parsed !== undefined) {
				search.append(key, parsed);
			}
		}
	}

	return search.toString();
}

/**
 * Resolution is done by `URL`; the only manual step is normalizing the join,
 * because `new URL("/users", "https://api.test/v1")` drops `/v1` — a leading
 * slash resets the path. Base therefore gains a trailing slash and the
 * endpoint loses its leading one before `URL` resolves them.
 */
export function buildUrl(options: BuildUrlOptions): string {
	const { baseUrl = "", endpoint, params = {}, serializer = serializeParams } = options;

	const absolute = isAbsolute(endpoint);
	const relative = !(baseUrl || absolute);
	const base = baseUrl ? `${baseUrl.replace(TRAILING_SLASHES, "")}/` : RELATIVE_BASE;
	const target = absolute ? endpoint : endpoint.replace(LEADING_SLASHES, "");

	const url = new URL(target, base);
	const query = serializer(params);

	if (query) {
		const current = url.search.slice(1);

		url.search = current ? `${current}&${query}` : query;
	}

	if (!relative) {
		return url.toString();
	}

	const resolved = `${url.pathname}${url.search}${url.hash}`;

	// Keep a page-relative endpoint page-relative.
	return endpoint.startsWith("/") ? resolved : resolved.replace(LEADING_SLASH, "");
}
