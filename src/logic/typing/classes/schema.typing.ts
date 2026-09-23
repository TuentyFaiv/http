/**
 * The Standard Schema v1 contract (https://standardschema.dev), inlined so
 * Zod, Valibot and ArkType all work without this library depending on any.
 */
export interface StandardSchemaV1<INPUT = unknown, OUTPUT = INPUT> {
	readonly "~standard": StandardSchemaV1Props<INPUT, OUTPUT>;
}

export interface StandardSchemaV1Props<INPUT = unknown, OUTPUT = INPUT> {
	readonly version: 1;
	readonly vendor: string;
	readonly validate: (value: unknown) => StandardSchemaV1Result<OUTPUT> | Promise<StandardSchemaV1Result<OUTPUT>>;
	readonly types?: StandardSchemaV1Types<INPUT, OUTPUT> | undefined;
}

export type StandardSchemaV1Result<OUTPUT> =
	| { readonly value: OUTPUT; readonly issues?: undefined }
	| { readonly issues: readonly StandardSchemaV1Issue[] };

export interface StandardSchemaV1Issue {
	readonly message: string;
	readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export interface StandardSchemaV1Types<INPUT = unknown, OUTPUT = INPUT> {
	readonly input: INPUT;
	readonly output: OUTPUT;
}

export type InferSchemaOutput<S> = S extends StandardSchemaV1<unknown, infer OUTPUT> ? OUTPUT : never;
