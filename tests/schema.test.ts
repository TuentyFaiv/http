import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "../src/index.js";

import { bare, Http, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

/**
 * A hand-rolled Standard Schema, proving the contract works with any library
 * implementing it (zod, valibot, arktype) without a dependency here.
 */
function schemaOf<T>(
	check: (value: unknown) => { value: T } | { issues: string[] },
	async = false
): StandardSchemaV1<unknown, T> {
	return {
		"~standard": {
			version: 1,
			vendor: "test",
			validate(value) {
				const outcome = check(value);
				const result =
					"issues" in outcome
						? { issues: outcome.issues.map((message) => ({ message, path: ["id"] })) }
						: { value: outcome.value };

				return async ? Promise.resolve(result) : result;
			},
		},
	};
}

interface User {
	id: number;
}

const userSchema = schemaOf<User>((value) => {
	const record = value as { id?: unknown };

	if (typeof record?.id !== "number") {
		return { issues: ["expected a number"] };
	}

	return { value: { id: record.id } };
});

describe("schema validation", () => {
	it("passes a valid payload through", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://schema-1.test", { fetch });

		const result = await api.get<User>("/users/1", { schema: userSchema });

		expect(result.payload).toEqual({ id: 1 });
	});

	it("validates the unwrapped payload, not the envelope", async () => {
		const seen: unknown[] = [];
		const spy = schemaOf<User>((value) => {
			seen.push(value);

			return { value: value as User };
		});

		const { fetch } = recorder(() => jsonResponse({ data: { id: 7 } }));
		const api = Http.create("https://schema-2.test", { fetch });

		await api.get<User>("/users/7", { schema: spy });

		expect(seen).toEqual([{ id: 7 }]);
	});

	it("rejects with ERR_SCHEMA and the issues", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: "nope" } }));
		const api = Http.create("https://schema-3.test", { fetch });

		const error = (await api
			.get<User>("/users/1", { schema: userSchema })
			.catch((thrown: unknown) => thrown)) as ServiceError;

		expect(error).toBeInstanceOf(ServiceError);
		expect(error.code).toBe("ERR_SCHEMA");
		expect(error.errors).toEqual(["id: expected a number"]);
	});

	it("uses the schema output as the payload, so transforms apply", async () => {
		const doubling = schemaOf<User>((value) => ({
			value: { id: (value as User).id * 2 },
		}));

		const { fetch } = recorder(() => jsonResponse({ data: { id: 21 } }));
		const api = Http.create("https://schema-4.test", { fetch });

		const result = await api.get<User>("/users/21", { schema: doubling });

		expect(result.payload).toEqual({ id: 42 });
	});

	it("supports async validation", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://schema-5.test", { fetch });

		const result = await api.get<User>("/users/1", {
			schema: schemaOf<User>((value) => ({ value: value as User }), true),
		});

		expect(result.payload).toEqual({ id: 1 });
	});

	it("validates the raw body for presets that do not unwrap", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 3 }));
		const api = Http.create("https://schema-6.test", { fetch, preset: bare });

		await expect(api.get<User>("/users/3", { schema: userSchema })).resolves.toEqual({ id: 3 });
	});

	it("reports the http failure rather than a schema failure", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://schema-7.test", { fetch });

		const error = (await api
			.get<User>("/users/1", { schema: userSchema })
			.catch((thrown: unknown) => thrown)) as ServiceError;

		expect(error.status).toBe(500);
		expect(error.code).toBeUndefined();
	});
});
