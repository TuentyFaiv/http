import { z } from "zod";

import type { ExampleText } from "../i18n/examples.js";

function nameSchema(text: ExampleText, numeric: boolean) {
	return numeric
		? z.object({ name: z.number({ error: text.schemaNumber }) })
		: z.object({ name: z.string({ error: text.schemaIssue }).trim() });
}

function transformSchema(text: ExampleText) {
	return z
		.object({ name: z.string({ error: text.schemaIssue }).trim() })
		.transform(({ name }) => ({ greeting: `Hello, ${name}`, characters: name.length }));
}

export { nameSchema, transformSchema };
