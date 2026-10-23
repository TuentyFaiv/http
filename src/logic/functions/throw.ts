/**
 * Normalizes a thrown value into an Error without rebuilding it, so the
 * original type, stack and cause survive. Non-Error throwables are wrapped
 * with the original value kept as `cause`.
 */
export function normalizeError(error: unknown): Error {
	return error instanceof Error ? error : new Error("¡Oh no!", { cause: error });
}
