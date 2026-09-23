import { describe, expect, expectTypeOf, it } from "vitest";

import { bare, Http, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

interface User {
	id: number;
}

describe("transport core", () => {
	it("sends the request through the injected fetch", async () => {
		const { calls, fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://core-1.test", { fetch });

		await api.get<User>("/users");

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://core-1.test/users");
		expect(calls[0]?.init?.method).toBe("GET");
	});

	it("passes query params and the body through", async () => {
		const { calls, fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://core-2.test", { fetch });

		await api.post<{ name: string }, User, { page: number }>(
			"/users",
			{ name: "ada" },
			{
				params: { page: 2 },
			}
		);

		expect(calls[0]?.url).toBe("https://core-2.test/users?page=2");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "ada" }));
	});
});

describe("envelope preset", () => {
	it("unwraps data and reports success", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://envelope-1.test", { fetch });

		const result = await api.get<User>("/users/1");

		expect(result.success).toBe(true);
		expect(result.payload).toEqual({ id: 1 });
		expectTypeOf(result.payload).toEqualTypeOf<User>();
	});

	it("rejects on an api convention even with a 200", async () => {
		const { fetch } = recorder(() => jsonResponse({ errors: { name: "required" } }));
		const api = Http.create("https://envelope-2.test", { fetch });

		const error = await api.get("/users").catch((thrown: unknown) => thrown);

		expect(error).toBeInstanceOf(ServiceError);
		expect((error as ServiceError).view().errors).toEqual({ name: "required" });
		expect((error as ServiceError).view().status).toBe(200);
	});

	it("rejects on a non-ok status", async () => {
		const { fetch } = recorder(() => jsonResponse({ message: "boom" }, { status: 500 }));
		const api = Http.create("https://envelope-3.test", { fetch });

		const error = await api.get("/users").catch((thrown: unknown) => thrown);

		expect(error).toBeInstanceOf(ServiceError);
		expect((error as ServiceError).view().message).toBe("boom");
		expect((error as ServiceError).view().status).toBe(500);
	});

	it("returns files as a blob", async () => {
		const { fetch } = recorder(
			() =>
				new Response(new Blob(["binary"]), {
					headers: { "Content-Type": "image/png" },
				})
		);
		const api = Http.create("https://envelope-4.test", { fetch });

		const result = await api.get<Blob>("/avatar.png");

		expect(result.message).toBe("Success to download");
		expect(result.payload).toBeInstanceOf(Blob);
	});

	it("keeps the returned response readable when clone is set", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://envelope-5.test", { fetch });

		const result = await api.get<User>("/users/1", { clone: true });

		await expect(result.response.json()).resolves.toEqual({ data: { id: 1 } });
	});
});

describe("bare preset", () => {
	it("returns the parsed body untouched", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://bare-1.test", { fetch, preset: bare });

		const user = await api.get<User>("/users/1");

		expect(user).toEqual({ id: 1 });
		expectTypeOf(user).toEqualTypeOf<User>();
	});

	it("ignores api conventions and only checks status", async () => {
		const { fetch } = recorder(() => jsonResponse({ errors: { name: "required" } }));
		const api = Http.create("https://bare-2.test", { fetch, preset: bare });

		await expect(api.get("/users")).resolves.toEqual({ errors: { name: "required" } });
	});
});

describe("legacy escape hatches", () => {
	it("lets a per-request thrower override preset validation", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { ok: true } }, { status: 500 }));
		const api = Http.create("https://legacy-1.test", { fetch });

		const result = await api.get<{ ok: boolean }>("/users", { thrower: () => {} });

		expect(result.payload).toEqual({ ok: true });
	});
});
