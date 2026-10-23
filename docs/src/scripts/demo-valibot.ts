import * as v from "valibot";

import type { ExampleText } from "../i18n/examples.js";

function nameSchema(text: ExampleText, numeric: boolean) {
	return numeric
		? v.object({ name: v.number(text.schemaNumber) })
		: v.object({ name: v.pipe(v.string(text.schemaIssue), v.trim()) });
}

function transformSchema(text: ExampleText) {
	return v.pipe(
		v.object({ name: v.pipe(v.string(text.schemaIssue), v.trim()) }),
		v.transform(({ name }) => ({ greeting: `Hello, ${name}`, characters: name.length }))
	);
}

export { nameSchema, transformSchema };
