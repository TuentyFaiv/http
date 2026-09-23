import { describe, expect, it } from "vitest";

import { buildUrl } from "../src/index.js";

describe("buildUrl", () => {
	it("joins base and endpoint with exactly one slash", () => {
		expect(buildUrl({ baseUrl: "https://api.test", endpoint: "/users" })).toBe("https://api.test/users");
		expect(buildUrl({ baseUrl: "https://api.test/", endpoint: "/users" })).toBe("https://api.test/users");
		expect(buildUrl({ baseUrl: "https://api.test/", endpoint: "users" })).toBe("https://api.test/users");
		expect(buildUrl({ baseUrl: "https://api.test", endpoint: "users" })).toBe("https://api.test/users");
	});

	it("keeps a base url with a path prefix", () => {
		expect(buildUrl({ baseUrl: "https://api.test/v1", endpoint: "/users" })).toBe("https://api.test/v1/users");
	});

	it("ignores the base url for absolute endpoints", () => {
		expect(buildUrl({ baseUrl: "https://api.test", endpoint: "https://other.test/x" })).toBe("https://other.test/x");
	});

	it("returns the endpoint untouched with no base url", () => {
		expect(buildUrl({ endpoint: "/users" })).toBe("/users");
	});

	it("appends to a query string the endpoint already has", () => {
		expect(buildUrl({ baseUrl: "https://api.test", endpoint: "/users?active=1", params: { page: 2 } })).toBe(
			"https://api.test/users?active=1&page=2"
		);
	});

	it("puts params before the hash", () => {
		expect(buildUrl({ baseUrl: "https://api.test", endpoint: "/users#list", params: { page: 2 } })).toBe(
			"https://api.test/users?page=2#list"
		);
	});

	it("repeats the key for arrays and serializes objects as json", () => {
		expect(buildUrl({ endpoint: "/x", params: { tag: ["a", "b"] } })).toBe("/x?tag=a&tag=b");
		expect(buildUrl({ endpoint: "/x", params: { filter: { id: 1 } } })).toBe("/x?filter=%7B%22id%22%3A1%7D");
	});

	it("skips null and undefined params", () => {
		expect(buildUrl({ endpoint: "/x", params: { a: 1, b: null, c: undefined } })).toBe("/x?a=1");
	});

	it("omits the query entirely when nothing survives", () => {
		expect(buildUrl({ endpoint: "/x", params: { b: null } })).toBe("/x");
	});

	it("encodes reserved characters in param values", () => {
		expect(buildUrl({ endpoint: "/x", params: { q: "a b&c" } })).toBe("/x?q=a+b%26c");
	});

	it("keeps a page-relative endpoint page-relative", () => {
		expect(buildUrl({ endpoint: "users", params: { page: 2 } })).toBe("users?page=2");
	});

	it("accepts a custom serializer", () => {
		expect(
			buildUrl({
				endpoint: "/x",
				params: { tag: ["a", "b"] },
				serializer: (params) => `tags=${(params.tag as string[]).join(",")}`,
			})
		).toBe("/x?tags=a,b");
	});
});
