import { describe, expect, expectTypeOf, it } from "vitest";

import type { ApplyShape, HttpSafeResult } from "../src/index.js";

import { bare, Http, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

interface User {
	id: number;
}

describe("safe", () => {
	it("returns { data, error: undefined } on success", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://safe-1.test", { fetch });

		const result = await api.safe.get<User>("/users/1");
		const { data, error } = result;

		expect(result).toStrictEqual({ data: expect.objectContaining({ payload: { id: 1 } }), error: undefined });
		expect(error).toBeUndefined();
		expectTypeOf(result).toEqualTypeOf<HttpSafeResult<ApplyShape<"envelope", User>>>();

		if (error) {
			expectTypeOf(data).toEqualTypeOf<undefined>();
			expectTypeOf(error).toEqualTypeOf<Error>();
			throw error;
		}

		expectTypeOf(data).toEqualTypeOf<ApplyShape<"envelope", User>>();
		expect(data.payload).toEqual({ id: 1 });
	});

	it("returns { data: undefined, error } instead of throwing", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://safe-2.test", { fetch });

		const result = await api.safe.get<User>("/users/1");
		const { data, error } = result;

		expect(result).toStrictEqual({ data: undefined, error: expect.any(ServiceError) });
		expect(error).toBeInstanceOf(ServiceError);
		expect((error as ServiceError).status).toBe(500);
		expect(data).toBeUndefined();
	});

	it("covers methods that take a body", async () => {
		const { calls, fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://safe-3.test", { fetch });

		const { data, error } = await api.safe.post<{ name: string }, User>("/users", { name: "ada" });

		expect(error).toBeUndefined();
		expect(data?.payload).toEqual({ id: 1 });
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "ada" }));
	});

	it("preserves the bare preset shape", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://safe-bare.test", { fetch, preset: bare });

		const result = await api.safe.get<User>("/users/1");

		expectTypeOf(result).toEqualTypeOf<HttpSafeResult<User>>();
		expect(result).toStrictEqual({ data: { id: 1 }, error: undefined });
	});

	it("allows successful undefined data", async () => {
		const { fetch } = recorder(() => new Response(null, { status: 204 }));
		const api = Http.create("https://safe-empty.test", { fetch, preset: bare });

		const result = await api.safe.get<undefined>("/users/1");
		const { data, error } = result;

		expect(result).toStrictEqual({ data: undefined, error: undefined });
		expectTypeOf(result).toEqualTypeOf<HttpSafeResult<undefined>>();

		if (error === undefined) {
			expectTypeOf(data).toEqualTypeOf<undefined>();
			expectTypeOf(error).toEqualTypeOf<undefined>();
		} else {
			throw error;
		}
	});

	it("preserves native errors", async () => {
		const failure = new TypeError("Failed to fetch");
		const { fetch } = recorder(() => {
			throw failure;
		});
		const api = Http.create("https://safe-native-error.test", { fetch });

		const { data, error } = await api.safe.get("/users/1");

		expect(data).toBeUndefined();
		expect(error).toBe(failure);
	});

	it("normalizes non-Error failures", async () => {
		const { fetch } = recorder(() => {
			// biome-ignore lint/style/useThrowOnlyError: verifies normalization of arbitrary transport failures
			throw "network failure";
		});
		const api = Http.create("https://safe-normalize.test", { fetch });

		const { data, error } = await api.safe.get("/users/1");

		expect(data).toBeUndefined();
		expect(error).toBeInstanceOf(Error);
		expect(error?.cause).toBe("network failure");
	});

	it("is reported by the in operator and reused between accesses", () => {
		const { fetch } = recorder();
		const api = Http.create("https://safe-4.test", { fetch });

		expect("safe" in api).toBe(true);
		expect(api.safe).toBe(api.safe);
	});

	it("leaves the throwing methods untouched", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://safe-5.test", { fetch });

		await expect(api.get("/users")).rejects.toBeInstanceOf(ServiceError);
	});
});
