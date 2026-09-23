import { describe, expect, it } from "vitest";

import type { HttpConfigConnection } from "../src/logic/typing/classes/http.typing.js";

import { ContentType } from "../src/index.js";
import { parseBody } from "../src/logic/functions/parse.js";

function parsed(body: unknown, contentType?: string) {
	const headers = new Headers(contentType ? { "Content-Type": contentType } : undefined);

	return parseBody({
		method: "POST",
		endpoint: "/x",
		secure: true,
		headers,
		body,
	} as HttpConfigConnection<unknown>);
}

describe("parseBody", () => {
	it("sends a string as-is instead of json encoding it", () => {
		const { body } = parsed("hello");

		expect(body).toBe("hello");
	});

	it("serializes plain objects as json and sets the header", () => {
		const { body, headers } = parsed({ a: 1 });

		expect(body).toBe(JSON.stringify({ a: 1 }));
		expect(headers.get("Content-Type")).toBe(ContentType.APPLICATION_JSON);
	});

	it("passes FormData through and drops Content-Type for the boundary", () => {
		const source = new FormData();
		source.append("a", "1");

		const { body, headers } = parsed(source, ContentType.APPLICATION_JSON);

		expect(body).toBe(source);
		expect(headers.has("Content-Type")).toBe(false);
	});

	it("passes URLSearchParams through with a form-urlencoded header", () => {
		const source = new URLSearchParams({ a: "1" });
		const { body, headers } = parsed(source);

		expect(body).toBe(source);
		expect(headers.get("Content-Type")).toBe(ContentType.APPLICATION_FORM_URLENCODED);
	});

	it("passes binary bodies through untouched", () => {
		const blob = new Blob(["x"]);
		const buffer = new ArrayBuffer(8);

		expect(parsed(blob).body).toBe(blob);
		expect(parsed(buffer).body).toBe(buffer);
		expect(parsed(new Uint8Array([1, 2])).body).toBeInstanceOf(Uint8Array);
	});

	it("sends no body for undefined and null", () => {
		expect(parsed(undefined).body).toBeUndefined();
		expect(parsed(null).body).toBeUndefined();
	});

	it("still builds FormData from an object when multipart is requested", () => {
		const { body, headers } = parsed({ a: 1 }, ContentType.APPLICATION_FORM_DATA);

		expect(body).toBeInstanceOf(FormData);
		expect((body as FormData).get("a")).toBe("1");
		expect(headers.has("Content-Type")).toBe(false);
	});

	it("keeps a declared Content-Type for json payloads", () => {
		const { headers } = parsed({ a: 1 }, ContentType.TEXT_PLAIN);

		expect(headers.get("Content-Type")).toBe(ContentType.TEXT_PLAIN);
	});
});
