import { describe, expect, it } from "vitest";

import type { HttpConfigConnection } from "../src/logic/typing/classes/http.typing.js";

import { ContentType } from "../src/index.js";
import { parseBody } from "../src/logic/functions/parse.js";

function formData(body: unknown): FormData {
	const config = {
		method: "POST",
		endpoint: "/upload",
		secure: true,
		headers: new Headers({ "Content-Type": ContentType.APPLICATION_FORM_DATA }),
		body,
	} as HttpConfigConnection<unknown>;

	return parseBody(config).body as FormData;
}

describe("parseBody form data", () => {
	it("appends a File once, keeping its filename", () => {
		const file = new File(["binary"], "avatar.png", { type: "image/png" });
		const parsed = formData({ avatar: file });

		expect(parsed.getAll("avatar")).toHaveLength(1);
		expect((parsed.get("avatar") as File).name).toBe("avatar.png");
	});

	it("appends a Blob once", () => {
		const parsed = formData({ chunk: new Blob(["binary"]) });

		expect(parsed.getAll("chunk")).toHaveLength(1);
	});

	it("indexes every array item, including the first", () => {
		const parsed = formData({ tags: ["a", "b"] });

		expect(parsed.getAll("tags[0]")).toEqual(["a"]);
		expect(parsed.getAll("tags[1]")).toEqual(["b"]);
		expect(parsed.has("tags")).toBe(false);
	});

	it("serializes primitives and nested objects once each", () => {
		const parsed = formData({ count: 5, active: true, meta: { a: 1 } });

		expect(parsed.getAll("count")).toEqual(["5"]);
		expect(parsed.getAll("active")).toEqual(["true"]);
		expect(parsed.getAll("meta")).toEqual([JSON.stringify({ a: 1 })]);
	});

	it("skips undefined and keeps null as a serialized value", () => {
		const parsed = formData({ nothing: undefined, empty: null });

		expect(parsed.has("nothing")).toBe(false);
		expect(parsed.get("empty")).toBe("null");
	});
});
