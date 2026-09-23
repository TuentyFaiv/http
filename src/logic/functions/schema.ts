import type {
	StandardSchemaV1,
	StandardSchemaV1Issue,
	StandardSchemaV1Result,
} from "../typing/classes/schema.typing.js";

export function validateSchema<OUTPUT>(
	schema: StandardSchemaV1<unknown, OUTPUT>,
	value: unknown
): StandardSchemaV1Result<OUTPUT> | Promise<StandardSchemaV1Result<OUTPUT>> {
	return schema["~standard"].validate(value);
}

/** Flattens issues into `path: message` strings for the error's `errors` field. */
export function issuesToErrors(issues: readonly StandardSchemaV1Issue[]): string[] {
	return issues.map((issue) => {
		const path = issue.path?.map((segment) => (typeof segment === "object" ? segment.key : segment)).join(".");

		return path ? `${path}: ${issue.message}` : issue.message;
	});
}
