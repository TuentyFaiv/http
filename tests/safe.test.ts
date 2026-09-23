import { describe, expect, it } from "vitest";

import { Http, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

interface User {
	id: number;
}

describe("safe", () => {
	it("returns [undefined, data] on success", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://safe-1.test", { fetch });

		const [error, result] = await api.safe.get<User>("/users/1");

		expect(error).toBeUndefined();
		expect(result?.payload).toEqual({ id: 1 });
	});

	it("returns [error, undefined] instead of throwing", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://safe-2.test", { fetch });

		const [error, result] = await api.safe.get<User>("/users/1");

		expect(error).toBeInstanceOf(ServiceError);
		expect((error as ServiceError).status).toBe(500);
		expect(result).toBeUndefined();
	});

	it("covers methods that take a body", async () => {
		const { calls, fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://safe-3.test", { fetch });

		const [error] = await api.safe.post<{ name: string }, User>("/users", { name: "ada" });

		expect(error).toBeUndefined();
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "ada" }));
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
