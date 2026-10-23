import { afterEach, describe, expect, it, vi } from "vitest";

import { Http } from "../src/index.js";
import { jsonResponse, recorder, sentHeaders } from "./helpers.js";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("request ownership and disabled-feature overhead", () => {
	it("allocates only one owned Headers object on the successful request path", async () => {
		const { fetch } = recorder();
		const api = Http.create("https://overhead-headers.test", { cache: false, fetch });
		const original = globalThis.Headers;
		let allocations = 0;
		class CountingHeaders extends original {
			constructor(init?: HeadersInit) {
				super(init);
				allocations += 1;
			}
		}
		vi.stubGlobal("Headers", CountingHeaders);

		await api.get("/users", { clone: false });

		expect(allocations).toBe(1);
	});

	it("copies native header inputs before body-specific adjustments", async () => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://overhead-owned.test", { cache: false, fetch });
		const headers = new Headers({ "Content-Type": "multipart/form-data", "X-Caller": "yes" });
		const form = new FormData();
		form.append("name", "Ada");

		await api.post("/users", form, { headers });

		expect(headers.get("Content-Type")).toBe("multipart/form-data");
		expect(headers.get("X-Caller")).toBe("yes");
		expect(sentHeaders(calls[0]?.init).has("Content-Type")).toBe(false);
		expect(sentHeaders(calls[0]?.init).get("X-Caller")).toBe("yes");
	});

	it.each(["GET", "HEAD"] as const)("does not serialize a body that %s cannot send", async (method) => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://overhead-bodyless.test", { cache: false, fetch });
		const body: Record<string, unknown> = {};
		body.self = body;

		await api.request({ method, endpoint: "/users", body });

		expect(calls).toHaveLength(1);
		expect(calls[0]?.init?.body).toBeUndefined();
		expect(sentHeaders(calls[0]?.init).has("Content-Type")).toBe(false);
	});

	it("resolves the default fetch per send and retains its platform receiver", async () => {
		const api = Http.create("https://overhead-default-fetch.test", { cache: false });
		const first = vi.fn(function (this: typeof globalThis) {
			expect(this).toBe(globalThis);
			return Promise.resolve(jsonResponse({ data: "first" }));
		});
		vi.stubGlobal("fetch", first);
		expect((await api.get("/users")).payload).toBe("first");

		const second = vi.fn(function (this: typeof globalThis) {
			expect(this).toBe(globalThis);
			return Promise.resolve(jsonResponse({ data: "second" }));
		});
		vi.stubGlobal("fetch", second);
		expect((await api.get("/users")).payload).toBe("second");
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
	});

	it("does not measure response duration when logging is disabled", async () => {
		const { fetch } = recorder();
		const api = Http.create("https://overhead-clock.test", { cache: false, fetch });
		const clock = vi.spyOn(Date, "now");

		await api.get("/users", { clone: false });

		expect(clock).not.toHaveBeenCalled();
	});

	it("unsubscribes the exact duplicate registration and makes unsubscribe idempotent", async () => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://overhead-subscription.test", { cache: false, fetch });
		const appendA = ({ init }: { init: { headers: Headers } }) => {
			init.headers.set("X-Order", `${init.headers.get("X-Order") ?? ""}A`);
		};
		api.hook("request", appendA);
		api.hook("request", ({ init }) => {
			init.headers.set("X-Order", `${init.headers.get("X-Order") ?? ""}B`);
		});
		const off = api.hook("request", appendA);

		await api.get("/users");
		off();
		off();
		await api.get("/users");

		expect(sentHeaders(calls[0]?.init).get("X-Order")).toBe("ABA");
		expect(sentHeaders(calls[1]?.init).get("X-Order")).toBe("AB");
	});
});
