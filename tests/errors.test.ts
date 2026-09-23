import { describe, expect, it } from "vitest";

import { Http, normalizeError, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

function serviceError() {
	return new ServiceError({
		message: "boom",
		status: 500,
		statusText: "500: Server Error",
		errors: { description: "boom" },
		code: "ERR_TEST",
	});
}

describe("ServiceError", () => {
	it("exposes the failure details as properties", () => {
		const error = serviceError();

		expect(error.message).toBe("boom");
		expect(error.status).toBe(500);
		expect(error.statusText).toBe("500: Server Error");
		expect(error.code).toBe("ERR_TEST");
	});

	it("serializes instead of logging as an empty object", () => {
		expect(JSON.parse(JSON.stringify(serviceError()))).toMatchObject({
			name: "ServiceError",
			message: "boom",
			status: 500,
			code: "ERR_TEST",
		});
	});

	it("keeps the view() accessor working, without presentation fields", () => {
		const data = serviceError().view();

		expect(data).toMatchObject({
			message: "boom",
			status: 500,
			code: "ERR_TEST",
		});
		expect(data).not.toHaveProperty("title");
		expect(data).not.toHaveProperty("icon");
		expect(data).not.toHaveProperty("time");
	});
});

describe("normalizeError", () => {
	it("returns the same instance instead of rebuilding it", () => {
		const original = serviceError();

		expect(normalizeError(original)).toBe(original);
	});

	it("preserves the stack of an unrelated error", () => {
		const original = new TypeError("Failed to fetch");

		expect(normalizeError(original)).toBe(original);
	});

	it("wraps a non-Error throwable, keeping it as the cause", () => {
		const normalized = normalizeError("boom");

		expect(normalized).toBeInstanceOf(Error);
		expect(normalized.cause).toBe("boom");
	});
});

describe("errors from a request", () => {
	it("attaches the request and response that failed", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 503 }));
		const api = Http.create("https://err-1.test", { fetch });

		const error = (await api.get("/users").catch((thrown: unknown) => thrown)) as ServiceError;

		expect(error).toBeInstanceOf(ServiceError);
		expect(error.status).toBe(503);
		expect(error.request).toEqual({ url: "https://err-1.test/users", method: "GET" });
		expect(error.response?.status).toBe(503);
	});

	it("lets an abort surface as the original AbortError", async () => {
		const fetch = async () => {
			throw new DOMException("Aborted", "AbortError");
		};
		const api = Http.create("https://err-2.test", { fetch });

		const error = (await api.get("/users").catch((thrown: unknown) => thrown)) as Error;

		expect(error.name).toBe("AbortError");
		expect(error).toBeInstanceOf(DOMException);
	});

	it("does not rebuild an error thrown by a custom thrower", async () => {
		const custom = new ServiceError({
			message: "custom",
			status: 418,
			statusText: "418",
			errors: "custom",
		});
		const { fetch } = recorder(() => jsonResponse({ ok: true }));
		const api = Http.create("https://err-3.test", { fetch });

		const error = await api
			.get("/users", {
				thrower: () => {
					throw custom;
				},
			})
			.catch((thrown: unknown) => thrown);

		expect(error).toBe(custom);
	});
});
