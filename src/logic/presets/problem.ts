import type { ApplyShape, ResponseContext } from "../typing/classes/preset.typing.js";
import type { Unwrap } from "./create.js";

import { problemDetails, statusFallback } from "./conventions.js";
import { createPreset } from "./create.js";

/**
 * RFC 9457 problem details. Successful responses return the parsed body as-is;
 * failures are read from `type`, `title`, `detail` and `status`.
 */
export const problem = createPreset({
	name: "problem",
	shape: "bare",
	conventions: [problemDetails(), statusFallback()],

	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"bare", T> {
		return unwrap(context.body) as T;
	},
});
