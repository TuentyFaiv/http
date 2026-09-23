import { describe, expect, it } from "vitest";

import type { HttpLogger } from "../src/index.js";

import { Http, redactHeaders, ServiceError } from "../src/index.js";
import { jsonResponse, recorder } from "./helpers.js";

describe("request hooks", () => {
	it("replaces the url and init before sending", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://hook-1.test", {
			fetch,
			hooks: {
				request: [
					({ url, init }) => {
						init.headers.set("X-Hook", "on");

						return { url: `${url}?hooked=1`, init };
					},
				],
			},
		});

		await api.get("/users");

		expect(calls[0]?.url).toBe("https://hook-1.test/users?hooked=1");
		expect(new Headers(calls[0]?.init?.headers).get("X-Hook")).toBe("on");
	});

	it("short-circuits the request when a hook returns a Response", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://hook-2.test", {
			fetch,
			hooks: {
				request: [() => jsonResponse({ data: { id: 99 } })],
			},
		});

		const result = await api.get<{ id: number }>("/users/99");

		expect(result.payload).toEqual({ id: 99 });
		expect(calls).toHaveLength(0);
	});

	it("runs hooks in registration order", async () => {
		const order: string[] = [];
		const { fetch } = recorder();
		const api = Http.create("https://hook-3.test", {
			fetch,
			hooks: {
				request: [
					() => {
						order.push("first");
					},
					() => {
						order.push("second");
					},
				],
			},
		});

		await api.get("/users");

		expect(order).toEqual(["first", "second"]);
	});
});

describe("response hooks", () => {
	it("replaces the response", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://hook-4.test", {
			fetch,
			hooks: {
				response: [() => jsonResponse({ data: { id: 2 } })],
			},
		});

		const result = await api.get<{ id: number }>("/users/1");

		expect(result.payload).toEqual({ id: 2 });
	});
});

describe("error hooks", () => {
	it("observes the failure and its request context", async () => {
		const seen: string[] = [];
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://hook-5.test", {
			fetch,
			hooks: {
				error: [
					(error, context) => {
						seen.push(`${error.message} ${context.url}`);
					},
				],
			},
		});

		await expect(api.get("/users")).rejects.toBeInstanceOf(ServiceError);
		expect(seen).toEqual(["nope https://hook-5.test/users"]);
	});

	it("replaces the thrown error when a hook returns one", async () => {
		const replacement = new Error("replaced");
		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://hook-6.test", {
			fetch,
			hooks: { error: [() => replacement] },
		});

		await expect(api.get("/users")).rejects.toBe(replacement);
	});
});

describe("hook registration", () => {
	it("adds and removes a hook at runtime", async () => {
		const { calls, fetch } = recorder();
		const api = Http.create("https://hook-7.test", { fetch });

		const off = api.hook("request", ({ url, init }) => ({ url: `${url}?added=1`, init }));

		await api.get("/users");
		off();
		await api.get("/users");

		expect(calls[0]?.url).toBe("https://hook-7.test/users?added=1");
		expect(calls[1]?.url).toBe("https://hook-7.test/users");
	});
});

describe("logger", () => {
	it("redacts sensitive headers", () => {
		const headers = new Headers({
			Authorization: "Bearer secret",
			Cookie: "session=secret",
			"X-Api-Key": "secret",
			"Content-Type": "application/json",
		});

		expect(redactHeaders(headers)).toEqual({
			authorization: "[redacted]",
			cookie: "[redacted]",
			"x-api-key": "[redacted]",
			"content-type": "application/json",
		});
	});

	it("reports request and response events to a custom logger", async () => {
		const events: string[] = [];
		const logger: HttpLogger = {
			request: ({ url }) => {
				events.push(`request ${url}`);
			},
			response: ({ response }) => {
				events.push(`response ${response.status}`);
			},
		};

		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://hook-8.test", { fetch, logger, log: true });

		await api.get("/users");

		expect(events).toEqual(["request https://hook-8.test/users", "response 200"]);
	});

	it("reports failures to the logger", async () => {
		const events: string[] = [];
		const logger: HttpLogger = {
			error: ({ error }) => {
				events.push(error.message);
			},
		};

		const { fetch } = recorder(() => jsonResponse({ message: "nope" }, { status: 500 }));
		const api = Http.create("https://hook-9.test", { fetch, logger, log: true });

		await expect(api.get("/users")).rejects.toThrow();
		expect(events).toEqual(["nope"]);
	});
});
