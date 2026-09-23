import { describe, expect, it } from "vitest";

import { Http } from "../src/index.js";
import { recorder } from "./helpers.js";

describe("method proxy", () => {
	it("dispatches every http method with the matching verb", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://proxy-1.test", { fetch });

		await api.get("/x");
		await api.post("/x", { a: 1 });
		await api.put("/x", { a: 1 });
		await api.patch("/x", { a: 1 });
		await api.delete("/x", { a: 1 });
		await api.options("/x", { a: 1 });

		expect(calls.map((call) => call.init?.method)).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
	});

	it("omits the body on GET and sends it on the others", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://proxy-2.test", { fetch });

		await api.get("/x");
		await api.post("/x", { a: 1 });

		expect(calls[0]?.init?.body).toBeUndefined();
		expect(calls[1]?.init?.body).toBe(JSON.stringify({ a: 1 }));
	});

	it("treats the second GET argument as config rather than a body", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://proxy-3.test", { fetch });

		await api.get<unknown, { page: number }>("/x", { params: { page: 2 } });

		expect(calls[0]?.url).toBe("https://proxy-3.test/x?page=2");
		expect(calls[0]?.init?.body).toBeUndefined();
	});

	it("keeps working when methods are destructured", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://proxy-4.test", { fetch });

		const { get, post } = api;

		await get("/x");
		await post("/y", { a: 1 });

		expect(calls.map((call) => call.url)).toEqual(["https://proxy-4.test/x", "https://proxy-4.test/y"]);
	});

	it("reports http methods through the in operator", () => {
		const { fetch } = recorder();
		const api = Http.create("https://proxy-5.test", { fetch });

		expect("get" in api).toBe(true);
		expect("delete" in api).toBe(true);
		expect("request" in api).toBe(true);
		expect("nope" in api).toBe(false);
	});

	it("still resolves non-method members", () => {
		const { fetch } = recorder();
		const api = Http.create("https://proxy-6.test", { fetch });

		expect(typeof api.request).toBe("function");
		expect(typeof api.hook).toBe("function");
	});
});
