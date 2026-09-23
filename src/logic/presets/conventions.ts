import type { HttpErrorInit, ResponseContext } from "../typing/classes/preset.typing.js";

import { isRecord } from "../functions/validation.js";

/**
 * Recognizes one api failure convention. Returns an error init to reject the
 * response, or undefined to let the next matcher decide.
 */
export type ConventionMatcher = (context: ResponseContext, json: Record<string, unknown>) => HttpErrorInit | undefined;

/** Shared error shaping, so every matcher reports failures the same way. */
export function toErrorInit(context: ResponseContext, json: Record<string, unknown>): HttpErrorInit {
	const { response } = context;
	const detail = isRecord(json.detail) ? json.detail : undefined;
	const statusText = `${response.status}: ${response.statusText || (json.error as string)}`;

	return {
		message: (context.errorMessage ?? json.error ?? json.message ?? detail?.message) as string,
		status: (json.code as number) ?? response.status,
		statusText: (json.result ?? json.status ?? statusText) as string,
		errors: (json.errors ??
			detail?.errors ?? {
				description: json.error ?? response.statusText,
			}) as HttpErrorInit["errors"],
	};
}

/** `{ error: "..." }` without a `result`. */
export function errorField(): ConventionMatcher {
	return (context, json) => (json.error && !json.result ? toErrorInit(context, json) : undefined);
}

/** `{ detail: { success: false, ... } }`, as Django REST Framework reports. */
export function detailField(): ConventionMatcher {
	return (context, json) => {
		const detail = isRecord(json.detail) ? json.detail : undefined;

		return json.detail && !detail?.success ? toErrorInit(context, json) : undefined;
	};
}

/** `{ payload: ..., success: false }`. */
export function payloadField(): ConventionMatcher {
	return (context, json) => (json.payload && !json.success ? toErrorInit(context, json) : undefined);
}

/** Any `{ errors: ... }`, even on a 200. */
export function errorsField(): ConventionMatcher {
	return (context, json) => (json.errors ? toErrorInit(context, json) : undefined);
}

/** RFC 9457 problem details. Only applies to failed responses. */
export function problemDetails(): ConventionMatcher {
	return (context, json) => {
		const { response } = context;

		if (response.ok) {
			return;
		}
		if (!(json.type || json.title || json.detail)) {
			return;
		}

		return {
			message: (context.errorMessage ?? json.detail ?? json.title ?? response.statusText) as string,
			status: (json.status as number) ?? response.status,
			statusText: (json.title ?? response.statusText) as string,
			errors: (json.errors ?? {
				description: (json.detail ?? json.title) as string,
			}) as HttpErrorInit["errors"],
			code: json.type as string | undefined,
		};
	};
}

/** The last word: anything outside 2xx is a failure. */
export function statusFallback(): ConventionMatcher {
	return (context, json) => (context.response.ok ? undefined : toErrorInit(context, json));
}
