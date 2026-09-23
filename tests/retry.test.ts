import { describe, expect, it } from "vitest";

import type { HttpFetch, ServiceError } from "../src/index.js";

import { Http } from "../src/index.js";
import { jsonResponse } from "./helpers.js";

/** Replays the given responses in order, counting the sends. */
function sequence(...responses: Array<() => Response>) {
	const calls: string[] = [];
	const fetch: HttpFetch = async (url, init) => {
		const next = responses[calls.length] ?? responses.at(-1);

		calls.push(`${init?.method} ${url}`);

		return next?.();
	};

	return { calls, fetch };
}

describe("retry", () => {
	it("retries a retryable status and succeeds", async () => {
		const { calls, fetch } = sequence(
			() => jsonResponse({ message: "busy" }, { status: 503 }),
			() => jsonResponse({ data: { id: 1 } })
		);
		const api = Http.create("https://retry-1.test", { fetch });

		const result = await api.get<{ id: number }>("/users/1", {
			retry: { attempts: 2, delay: 0 },
		});

		expect(calls).toHaveLength(2);
		expect(result.payload).toEqual({ id: 1 });
	});

	it("gives up after the configured attempts", async () => {
		const { calls, fetch } = sequence(() => jsonResponse({ message: "busy" }, { status: 503 }));
		const api = Http.create("https://retry-2.test", { fetch });

		const error = (await api
			.get("/users", { retry: { attempts: 2, delay: 0 } })
			.catch((thrown: unknown) => thrown)) as ServiceError;

		expect(calls).toHaveLength(3);
		expect(error.status).toBe(503);
	});

	it("does not retry POST by default", async () => {
		const { calls, fetch } = sequence(() => jsonResponse({ message: "busy" }, { status: 503 }));
		const api = Http.create("https://retry-3.test", { fetch });

		await expect(api.post("/users", { a: 1 }, { retry: { attempts: 2, delay: 0 } })).rejects.toThrow();
		expect(calls).toHaveLength(1);
	});

	it("retries POST when the method is opted in", async () => {
		const { calls, fetch } = sequence(
			() => jsonResponse({ message: "busy" }, { status: 503 }),
			() => jsonResponse({ data: { id: 1 } })
		);
		const api = Http.create("https://retry-4.test", { fetch });

		await api.post(
			"/users",
			{ a: 1 },
			{
				retry: { attempts: 2, delay: 0, methods: ["POST"] },
			}
		);

		expect(calls).toHaveLength(2);
	});

	it("does not retry a status outside the retryable list", async () => {
		const { calls, fetch } = sequence(() => jsonResponse({ message: "nope" }, { status: 404 }));
		const api = Http.create("https://retry-5.test", { fetch });

		await expect(api.get("/users", { retry: { attempts: 2, delay: 0 } })).rejects.toThrow();
		expect(calls).toHaveLength(1);
	});

	it("honours Retry-After over the configured delay", async () => {
		const { calls, fetch } = sequence(
			() =>
				jsonResponse(
					{ message: "busy" },
					{
						status: 429,
						headers: { "Content-Type": "application/json", "Retry-After": "0" },
					}
				),
			() => jsonResponse({ data: { id: 1 } })
		);
		const api = Http.create("https://retry-6.test", { fetch });

		await api.get("/users", { retry: { attempts: 1, delay: 5000 } });

		expect(calls).toHaveLength(2);
	});

	it("retries a network failure", async () => {
		let attempts = 0;
		const fetch: HttpFetch = async () => {
			attempts += 1;

			if (attempts === 1) {
				throw new TypeError("Failed to fetch");
			}

			return jsonResponse({ data: { id: 1 } });
		};
		const api = Http.create("https://retry-7.test", { fetch });

		const result = await api.get<{ id: number }>("/users/1", {
			retry: { attempts: 2, delay: 0 },
		});

		expect(attempts).toBe(2);
		expect(result.payload).toEqual({ id: 1 });
	});

	it("never retries an abort", async () => {
		let attempts = 0;
		const fetch: HttpFetch = async () => {
			attempts += 1;

			throw new DOMException("Aborted", "AbortError");
		};
		const api = Http.create("https://retry-8.test", { fetch });

		await expect(api.get("/users", { retry: { attempts: 3, delay: 0 } })).rejects.toThrow();
		expect(attempts).toBe(1);
	});

	it("can be set once on the instance", async () => {
		const { calls, fetch } = sequence(
			() => jsonResponse({ message: "busy" }, { status: 503 }),
			() => jsonResponse({ data: { id: 1 } })
		);
		const api = Http.create("https://retry-9.test", { fetch, retry: { attempts: 2, delay: 0 } });

		await api.get("/users/1");

		expect(calls).toHaveLength(2);
	});
});
