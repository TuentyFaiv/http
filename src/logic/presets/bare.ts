import type { ApplyShape, ResponseContext } from "../typing/classes/preset.typing.js";
import type { Unwrap } from "./create.js";

import { statusFallback } from "./conventions.js";
import { createPreset } from "./create.js";

/**
 * Neutral preset: rejects on http status alone and returns the parsed body
 * untouched, with no envelope and no unwrapping.
 */
export const bare = createPreset({
	name: "bare",
	shape: "bare",
	conventions: [statusFallback()],

	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"bare", T> {
		return unwrap(context.body) as T;
	},
});
