import type { ApplyShape, ResponseContext } from "../typing/classes/preset.typing.js";
import type { Unwrap } from "./create.js";

import { statusFallback } from "./conventions.js";
import { createPreset } from "./create.js";

/**
 * Familiar shape for anyone arriving from axios: status-only validation and a
 * `{ data, status, headers, response }` result.
 */
export const rest = createPreset({
	name: "rest",
	shape: "rest",
	conventions: [statusFallback()],

	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"rest", T> {
		return {
			data: unwrap(context.body) as T,
			status: context.status,
			headers: context.response.headers,
			response: context.response,
		};
	},
});
