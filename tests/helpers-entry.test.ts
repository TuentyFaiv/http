import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("pure helper entry", () => {
	it("does not initialize the client registry or perform network/storage work", async () => {
		const network = vi.fn(() => {
			throw new Error("Import must not make requests");
		});
		const storage = {
			getItem: vi.fn(),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		};
		vi.stubGlobal("fetch", network);
		vi.stubGlobal("localStorage", storage);
		vi.stubGlobal("sessionStorage", storage);

		const helpers = await import("../src/helpers.js");
		expect(helpers).not.toHaveProperty("Http");
		expect(helpers).not.toHaveProperty("default");
		expect(helpers.normalizeError(new TypeError("test"))).toBeInstanceOf(TypeError);

		const { HttpInstance } = await import("../src/logic/classes/http.js");
		const fetch = vi.fn(async () => Response.json({ id: 7 }));
		// A root import would already have registered the envelope client for "".
		const client = HttpInstance.create("", { preset: helpers.bare, fetch });
		await expect(client.get("/me")).resolves.toEqual({ id: 7 });
		expect(fetch).toHaveBeenCalledOnce();
		expect(network).not.toHaveBeenCalled();
		expect(storage.getItem).not.toHaveBeenCalled();
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it("keeps root exports, helper identity, and the default shared instance unchanged", async () => {
		const helpers = await import("../src/helpers.js");
		const root = await import("../src/index.js");

		expect(root.default).toBe(root.Http.create(""));
		for (const name of Object.keys(helpers)) {
			expect(root[name as keyof typeof root]).toBe(helpers[name as keyof typeof helpers]);
		}
		expect(root.ServiceError).toBe(helpers.ServiceError);
		expect(root.bare).toBe(helpers.bare);
		expect(Object.isFrozen(helpers.HttpMethod)).toBe(true);
		expect(Object.isFrozen(helpers.ContentType)).toBe(true);
	});
});
