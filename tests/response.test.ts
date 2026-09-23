import { describe, expect, it } from "vitest";

import { Http, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

describe("response handling", () => {
	it("handles 204 without trying to parse a body", async () => {
		const { fetch } = recorder(() => new Response(null, { status: 204 }));
		const api = Http.create("https://res-1.test", { fetch });

		const result = await api.delete("/users/1", undefined);

		expect(result.success).toBe(true);
		expect(result.payload).toBeUndefined();
	});

	it("handles an empty body on a 200", async () => {
		const { fetch } = recorder(
			() =>
				new Response("", {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
		);
		const api = Http.create("https://res-2.test", { fetch });

		const result = await api.get("/ping");

		expect(result.payload).toBeUndefined();
	});

	it("parses +json media types", async () => {
		const { fetch } = recorder(
			() =>
				new Response(JSON.stringify({ id: 1 }), {
					status: 200,
					headers: { "Content-Type": "application/vnd.api+json" },
				})
		);
		const api = Http.create("https://res-3.test", { fetch });

		const result = await api.get<{ id: number }>("/users/1");

		expect(result.payload).toEqual({ id: 1 });
	});

	it("returns the response readable by default for json", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://res-4.test", { fetch });

		const result = await api.get("/users/1");

		await expect(result.response.json()).resolves.toEqual({ data: { id: 1 } });
	});

	it("honours an explicit responseType of text", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://res-5.test", { fetch });

		const result = await api.get<string>("/users/1", { responseType: "text" });

		expect(result.payload).toBe(JSON.stringify({ id: 1 }));
	});

	it("honours an explicit responseType of blob", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://res-6.test", { fetch });

		const result = await api.get<Blob>("/users/1", { responseType: "blob" });

		expect(result.payload).toBeInstanceOf(Blob);
	});

	it("reports invalid json with a code and the original cause", async () => {
		const { fetch } = recorder(
			() =>
				new Response("<html>nope</html>", {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
		);
		const api = Http.create("https://res-7.test", { fetch });

		const error = await api.get("/users").catch((thrown: unknown) => thrown);

		expect(error).toBeInstanceOf(ServiceError);
		expect((error as ServiceError).code).toBe("ERR_INVALID_JSON");
		expect((error as ServiceError).cause).toBeInstanceOf(SyntaxError);
	});
});
