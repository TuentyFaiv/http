import type {
	ApplyShape,
	HttpErrorInit,
	HttpPreset,
	ResponseContext,
	ShapeName,
} from "../typing/classes/preset.typing.js";
import type { ConventionMatcher } from "./conventions.js";

import { isRecord } from "../functions/validation.js";

export type Unwrap = (body: unknown) => unknown;

export interface CreatePresetOptions<K extends ShapeName> {
	name: string;
	shape: K;
	/** Run in order; the first match rejects the response. */
	conventions?: ConventionMatcher[];
	/** Keys tried in order when pulling the payload out of an envelope. */
	unwrap?: string[];
	build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<K, T>;
}

export interface HttpPresetDefinition<K extends ShapeName> extends HttpPreset<K> {
	conventions: ConventionMatcher[];
	unwrap: string[];
	/** Derives a new preset, reusing this one's build step. */
	extend(overrides: Partial<Pick<HttpPresetDefinition<K>, "name" | "conventions" | "unwrap">>): HttpPresetDefinition<K>;
}

export function unwrapKeys(body: unknown, keys: string[]): unknown {
	if (!isRecord(body)) {
		return body;
	}

	const found = keys.find((key) => body[key] !== null && body[key] !== undefined);

	return found ? body[found] : body;
}

export function createPreset<K extends ShapeName>(options: CreatePresetOptions<K>): HttpPresetDefinition<K> {
	const { name, shape, conventions = [], unwrap = [], build } = options;

	return {
		name,
		shape,
		conventions,
		unwrap,

		validate(context: ResponseContext): HttpErrorInit | undefined {
			const json = context.kind === "json" && isRecord(context.body) ? context.body : {};

			for (const matcher of conventions) {
				const error = matcher(context, json);

				if (error) {
					return error;
				}
			}

			return undefined;
		},

		build<T>(context: ResponseContext): ApplyShape<K, T> {
			return build<T>(context, (body) => (context.payload !== undefined ? context.payload : unwrapKeys(body, unwrap)));
		},

		extend(overrides) {
			return createPreset<K>({
				name: overrides.name ?? name,
				shape,
				conventions: overrides.conventions ?? conventions,
				unwrap: overrides.unwrap ?? unwrap,
				build,
			});
		},
	};
}
