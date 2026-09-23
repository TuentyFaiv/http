import { describe, expect, it } from "vitest";

import { Http } from "../src/index.js";
import { recorder, sentHeaders } from "./helpers.js";

describe("HEAD", () => {
	it("sends no body and takes config as its second argument", async () => {
		const { calls, fetch } = recorder(() => new Response(null, { status: 200 }));
		const api = Http.create("https://method-1.test", { fetch });

		const result = await api.head<undefined, { page: number }>("/users", {
			params: { page: 2 },
		});

		expect(calls[0]?.init?.method).toBe("HEAD");
		expect(calls[0]?.init?.body).toBeUndefined();
		expect(calls[0]?.url).toBe("https://method-1.test/users?page=2");
		expect(result.success).toBe(true);
	});

	it("drops Content-Type like GET does", async () => {
		const { calls, fetch } = recorder(() => new Response(null, { status: 200 }));
		const api = Http.create("https://method-2.test", { fetch });

		await api.head("/users");

		expect(sentHeaders(calls[0]?.init).has("Content-Type")).toBe(false);
	});
});

describe("optional bodies", () => {
	it("allows a bodyless DELETE", async () => {
		const { calls, fetch } = recorder(() => new Response(null, { status: 204 }));
		const api = Http.create("https://method-3.test", { fetch });

		await api.delete("/users/1");

		expect(calls[0]?.init?.method).toBe("DELETE");
		expect(calls[0]?.init?.body).toBeUndefined();
	});

	it("allows a bodyless POST", async () => {
		const { calls, fetch } = recorder(() => new Response(null, { status: 204 }));
		const api = Http.create("https://method-4.test", { fetch });

		await api.post("/users/1/ping");

		expect(calls[0]?.init?.body).toBeUndefined();
	});
});

describe("HeadersInit", () => {
	it("accepts a record", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://method-5.test", {
			fetch,
			headers: { "X-Source": "record" },
		});

		await api.get("/x");

		expect(sentHeaders(calls[0]?.init).get("X-Source")).toBe("record");
	});

	it("accepts an entry array", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://method-6.test", {
			fetch,
			headers: [["X-Source", "array"]],
		});

		await api.get("/x");

		expect(sentHeaders(calls[0]?.init).get("X-Source")).toBe("array");
	});

	it("accepts a Headers instance", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://method-7.test", {
			fetch,
			headers: new Headers({ "X-Source": "headers" }),
		});

		await api.get("/x");

		expect(sentHeaders(calls[0]?.init).get("X-Source")).toBe("headers");
	});
});
