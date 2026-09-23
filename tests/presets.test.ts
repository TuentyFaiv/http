import { describe, expect, expectTypeOf, it } from "vitest";

import type { ApplyShape, ResponseContext } from "../src/index.js";

import { createPreset, envelope, Http, problem, rest, ServiceError, statusFallback } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

declare module "../src/logic/typing/classes/preset.typing.js" {
	interface HttpShapes<T> {
		acme: { ok: boolean; result: T };
	}
}

interface User {
	id: number;
}

describe("rest preset", () => {
	it("returns data, status and headers", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://preset-1.test", { fetch, preset: rest });

		const result = await api.get<User>("/users/1");

		expect(result.data).toEqual({ id: 1 });
		expect(result.status).toBe(200);
		expect(result.headers.get("Content-Type")).toBe("application/json");
		expectTypeOf(result.data).toEqualTypeOf<User>();
	});

	it("rejects on status alone, ignoring api conventions", async () => {
		const { fetch } = recorder(() => jsonResponse({ errors: { a: "b" } }));
		const api = Http.create("https://preset-2.test", { fetch, preset: rest });

		await expect(api.get("/users")).resolves.toMatchObject({ status: 200 });
	});
});

describe("problem preset", () => {
	it("reads rfc 9457 problem details", async () => {
		const { fetch } = recorder(
			() =>
				new Response(
					JSON.stringify({
						type: "https://example.com/probs/out-of-credit",
						title: "You do not have enough credit.",
						detail: "Your balance is 30.",
						status: 403,
					}),
					{
						status: 403,
						headers: { "Content-Type": "application/problem+json" },
					}
				)
		);
		const api = Http.create("https://preset-3.test", { fetch, preset: problem });

		const error = (await api.get("/orders").catch((thrown: unknown) => thrown)) as ServiceError;

		expect(error).toBeInstanceOf(ServiceError);
		expect(error.message).toBe("Your balance is 30.");
		expect(error.statusText).toBe("You do not have enough credit.");
		expect(error.status).toBe(403);
		expect(error.code).toBe("https://example.com/probs/out-of-credit");
	});

	it("falls back to status when the body is not a problem document", async () => {
		const { fetch } = recorder(() => jsonResponse({ oops: true }, { status: 500 }));
		const api = Http.create("https://preset-4.test", { fetch, preset: problem });

		const error = (await api.get("/orders").catch((thrown: unknown) => thrown)) as ServiceError;

		expect(error.status).toBe(500);
	});

	it("returns the parsed body untouched on success", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://preset-5.test", { fetch, preset: problem });

		await expect(api.get<User>("/users/1")).resolves.toEqual({ id: 1 });
	});
});

describe("conventions", () => {
	it("exposes the envelope matchers in order", () => {
		expect(envelope.conventions).toHaveLength(5);
		expect(envelope.unwrap).toEqual(["data", "payload"]);
	});

	it("extends a preset with an extra matcher without touching the original", async () => {
		const strict = envelope.extend({
			name: "strict",
			conventions: [
				(_context, json) =>
					json.warning
						? {
								message: "warned",
								status: 400,
								statusText: "400: warned",
								errors: "warned",
							}
						: undefined,
				...envelope.conventions,
			],
		});

		const { fetch } = recorder(() => jsonResponse({ warning: true, data: { id: 1 } }));
		const api = Http.create("https://preset-6.test", { fetch, preset: strict });

		const error = (await api.get("/users").catch((thrown: unknown) => thrown)) as ServiceError;

		expect(strict.name).toBe("strict");
		expect(error.message).toBe("warned");
		expect(envelope.conventions).toHaveLength(5);
	});

	it("extends a preset with different unwrap keys", async () => {
		const unwrapped = envelope.extend({ unwrap: ["result"] });

		const { fetch } = recorder(() => jsonResponse({ result: { id: 1 }, data: { id: 2 } }));
		const api = Http.create("https://preset-7.test", { fetch, preset: unwrapped });

		const response = await api.get<User>("/users/1");

		expect(response.payload).toEqual({ id: 1 });
	});
});

describe("custom shapes", () => {
	it("supports a shape registered through declaration merging", async () => {
		const acme = createPreset({
			name: "acme",
			shape: "acme",
			conventions: [statusFallback()],

			build<T>(context: ResponseContext): ApplyShape<"acme", T> {
				return { ok: context.response.ok, result: context.body as T };
			},
		});

		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://preset-8.test", { fetch, preset: acme });

		const result = await api.get<User>("/users/1");

		expect(result).toEqual({ ok: true, result: { id: 1 } });
		expectTypeOf(result.result).toEqualTypeOf<User>();
	});
});
