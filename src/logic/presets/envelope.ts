import type { ApplyShape, ResponseContext } from "../typing/classes/preset.typing.js";
import type { Unwrap } from "./create.js";

import { ServiceError } from "../classes/errors.js";
import { isRecord } from "../functions/validation.js";
import { detailField, errorField, errorsField, payloadField, statusFallback } from "./conventions.js";
import { createPreset } from "./create.js";

function keyCount(value: unknown): number {
	if (value === null || value === undefined) {
		return 0;
	}

	return Object.keys(value as object).length;
}

/**
 * Default preset. Recognizes the api conventions this library was built
 * against and returns the `{ success, message, payload, response }` envelope.
 */
export const envelope = createPreset({
	name: "envelope",
	shape: "envelope",
	conventions: [errorField(), detailField(), payloadField(), errorsField(), statusFallback()],
	unwrap: ["data", "payload"],

	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"envelope", T> {
		const { response, kind, body } = context;

		if (kind === "file") {
			return {
				success: true,
				message: "Success to download",
				payload: body as T,
				response,
			};
		}

		if (kind === "json") {
			const json = isRecord(body) ? body : {};
			const payload = unwrap(body);

			return {
				success: Boolean(json.result) || Boolean(json.success) || keyCount(payload) > 0,
				message: (json.error ?? json.message ?? "") as string,
				payload: payload as T,
				response,
			};
		}

		if (kind === "text") {
			return {
				success: true,
				message: response.statusText,
				payload: body as T,
				response,
			};
		}

		if (kind === "empty" || kind === "stream") {
			return {
				success: response.ok,
				message: response.statusText,
				payload: body as T,
				response,
			};
		}

		throw new ServiceError({
			message: "response content type not supported",
			status: response.status,
			statusText: `${response.status}: ${response.statusText}`,
			errors: {
				description: response.statusText,
			},
		});
	},
});
