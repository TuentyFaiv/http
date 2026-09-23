import { describe, expect, it } from "vitest";

import { ContentType, Http } from "../src/index.js";
import { recorder, sentHeaders } from "./helpers.js";

describe("initial headers", () => {
	it("keeps headers given as a Headers instance", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://cfg-1.test", {
			fetch,
			headers: new Headers({
				"Accept-Language": "es",
				Authorization: "Bearer token",
			}),
		});

		await api.get("/x");

		expect(sentHeaders(calls[0]?.init).get("Accept-Language")).toBe("es");
		expect(sentHeaders(calls[0]?.init).get("Authorization")).toBe("Bearer token");
	});

	it("keeps a custom Content-Type from create()", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://cfg-2.test", {
			fetch,
			headers: { "Content-Type": ContentType.TEXT_PLAIN },
		});

		await api.post("/x", "hello");

		expect(sentHeaders(calls[0]?.init).get("Content-Type")).toBe(ContentType.TEXT_PLAIN);
	});

	it("defaults Content-Type to json when none is given", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://cfg-3.test", { fetch });

		await api.post("/x", { a: 1 });

		expect(sentHeaders(calls[0]?.init).get("Content-Type")).toBe(ContentType.APPLICATION_JSON);
	});
});

describe("secure precedence", () => {
	it("applies instance-level secure:false", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://cfg-4.test", {
			fetch,
			secure: false,
			headers: { Authorization: "Bearer token" },
		});

		await api.get("/x");

		expect(sentHeaders(calls[0]?.init).get("Authorization")).toBeNull();
	});

	it("keeps Authorization when secure is left at its default", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://cfg-5.test", {
			fetch,
			headers: { Authorization: "Bearer token" },
		});

		await api.get("/x");

		expect(sentHeaders(calls[0]?.init).get("Authorization")).toBe("Bearer token");
	});

	it("lets a single request override the instance", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://cfg-6.test", {
			fetch,
			secure: false,
			headers: { Authorization: "Bearer token" },
		});

		await api.get("/x", { secure: true });

		expect(sentHeaders(calls[0]?.init).get("Authorization")).toBe("Bearer token");
	});
});

describe("instance cache", () => {
	it("returns the same instance for the same api", () => {
		const first = Http.create("https://cfg-7.test");
		const second = Http.create("https://cfg-7.test");

		expect(first).toBe(second);
	});

	it("returns a fresh instance when caching is disabled", () => {
		const first = Http.create("https://cfg-8.test", { cache: false });
		const second = Http.create("https://cfg-8.test", { cache: false });

		expect(first).not.toBe(second);
	});

	it("never stores an uncached instance", () => {
		const isolated = Http.create("https://cfg-9.test", { cache: false });
		const shared = Http.create("https://cfg-9.test");

		expect(shared).not.toBe(isolated);
	});

	it("does not collide with Object.prototype keys", () => {
		const api = Http.create("constructor");

		expect(typeof api.get).toBe("function");
		expect(typeof api.request).toBe("function");
	});
});
