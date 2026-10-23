import { describe, expect, expectTypeOf, it } from "vitest";

import type {
	ApplyShape,
	HttpConfigGet,
	HttpSafeResult,
	ResponseContext,
	StandardSchemaV1,
	Unwrap,
} from "../src/index.js";

import { bare, createPreset, Http, rest } from "../src/index.js";
import { jsonResponse, recorder, sentHeaders } from "./helpers.js";

declare module "../src/logic/typing/classes/preset.typing.js" {
	interface HttpShapes<T> {
		inferred: { item: T };
	}
}

interface User {
	id: number;
}

interface Query {
	page: number;
}

const userSchema: StandardSchemaV1<unknown, User> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: (value) => ({ value: { id: Number((value as User).id) } }),
	},
};

function schemaReturning<T>(value: T): StandardSchemaV1<unknown, T> {
	return {
		"~standard": { version: 1, vendor: "test", validate: () => ({ value }) },
	};
}

describe("request inference", () => {
	it("accepts query interfaces without another generic, while preserving explicit param types", async () => {
		const { fetch, calls } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const api = Http.create("https://inference-query.test", { cache: false, fetch });
		const params: Query = { page: 2 };

		const get = await api.get<User>("/users", { params });
		const safe = await api.safe.get<User>("/users", { params });
		const post = await api.post<{ name: string }, User>("/users", { name: "Ada" }, { params });
		const request = await api.request<undefined, User>({ method: "GET", endpoint: "/users", params });

		expectTypeOf(get.payload).toEqualTypeOf<User>();
		expectTypeOf(safe).toEqualTypeOf<HttpSafeResult<ApplyShape<"envelope", User>>>();
		expectTypeOf(post.payload).toEqualTypeOf<User>();
		expectTypeOf(request.payload).toEqualTypeOf<User>();
		expect(calls).toHaveLength(4);
		expect(calls.every((call) => call.url === "https://inference-query.test/users?page=2")).toBe(true);

		// biome-ignore lint/correctness/noConstantCondition: checks rejection of invalid explicit parameter types.
		if (false) {
			// @ts-expect-error An explicitly supplied Query still requires a numeric page.
			api.get<User, Query>("/users", { params: { page: "wrong" } });
		}
	});

	it("infers schema output through normal and safe methods", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: "7" } }));
		const api = Http.create("https://inference-schema.test", { cache: false, fetch });

		const get = await api.get("/users", { schema: userSchema, params: { page: 1 } });
		const post = await api.post("/users", { name: "Ada" }, { schema: userSchema });
		const safe = await api.safe.patch("/users", { name: "Ada" }, { schema: userSchema });

		expectTypeOf(get.payload).toEqualTypeOf<User>();
		expectTypeOf(post.payload).toEqualTypeOf<User>();
		expectTypeOf(safe).toEqualTypeOf<HttpSafeResult<ApplyShape<"envelope", User>>>();
		expect(get.payload).toEqual({ id: 7 });
		expect(post.payload).toEqual({ id: 7 });
		if (safe.error) {
			throw safe.error;
		}
		expectTypeOf(safe.data.payload).toEqualTypeOf<User>();
		expect(safe.data.payload).toEqual({ id: 7 });
	});

	it("infers transformed async output rather than schema input, including the request primitive", async () => {
		const dateSchema: StandardSchemaV1<string, Date> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: async (value) => ({ value: new Date(String(value)) }),
			},
		};
		const { fetch } = recorder(() => jsonResponse("2025-01-01T00:00:00Z"));
		const api = Http.create("https://inference-date.test", { cache: false, fetch, preset: rest });
		const result = await api.request({ method: "GET", endpoint: "/date", schema: dateSchema });
		const safe = await api.safe.get("/date", { schema: dateSchema });

		expectTypeOf(result.data).toEqualTypeOf<Date>();
		expectTypeOf(safe).toEqualTypeOf<HttpSafeResult<ApplyShape<"rest", Date>>>();
		expect(result.data.toISOString()).toBe("2025-01-01T00:00:00.000Z");
	});

	it("infers structurally supplied schemas without an explicit Standard Schema annotation", async () => {
		const schema = {
			"~standard": {
				version: 1 as const,
				vendor: "structural",
				validate: async () => ({ value: { id: 7 } }),
			},
		};
		const { fetch } = recorder(() => jsonResponse({ id: "7" }));
		const api = Http.create("https://inference-structural.test", { cache: false, fetch, preset: bare });
		const result = await api.get("/users", { schema });

		expectTypeOf(result).toEqualTypeOf<User>();
		expect(result).toEqual({ id: 7 });
	});

	it("keeps unvalidated and optional-schema results unknown", async () => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://inference-unknown.test", { cache: false, fetch, preset: bare });
		const options: HttpConfigGet = {};
		const optional: { schema?: typeof userSchema } = {};

		expectTypeOf(await api.get("/users")).toEqualTypeOf<unknown>();
		expectTypeOf(await api.get("/users", { responseType: "json" })).toEqualTypeOf<unknown>();
		expectTypeOf(await api.get("/users", { responseType: "auto" })).toEqualTypeOf<unknown>();
		expectTypeOf(await api.get("/users", options)).toEqualTypeOf<unknown>();
		expectTypeOf(await api.get("/users", optional)).toEqualTypeOf<unknown>();
	});

	it("applies inferred schema output to third-party preset shapes", async () => {
		const preset = createPreset({
			name: "inferred",
			shape: "inferred",
			unwrap: ["data"],
			build<T>(context: ResponseContext, unwrap: Unwrap): ApplyShape<"inferred", T> {
				return { item: unwrap(context.body) as T };
			},
		});
		const { fetch } = recorder(() => jsonResponse({ data: { id: "7" } }));
		const api = Http.create("https://inference-custom.test", { cache: false, fetch, preset });
		const result = await api.get("/users", { schema: userSchema });

		expectTypeOf(result.item).toEqualTypeOf<User>();
		expect(result.item).toEqual({ id: 7 });
	});

	it("preserves validated undefined output instead of falling back to the raw body", async () => {
		const { fetch } = recorder(() => jsonResponse({ data: { id: 1 } }));
		const schema = schemaReturning(undefined);
		const api = Http.create("https://inference-undefined.test", { cache: false, fetch });
		const raw = Http.create("https://inference-undefined.test", { cache: false, fetch, preset: bare });

		const result = await api.get("/users", { schema });
		const safe = await raw.safe.get("/users", { schema });

		expectTypeOf(result.payload).toEqualTypeOf<undefined>();
		expectTypeOf(safe).toEqualTypeOf<HttpSafeResult<undefined>>();
		expect(result.payload).toBeUndefined();
		expect(safe).toStrictEqual({ data: undefined, error: undefined });
	});

	it.each([null, false, 0, ""])("preserves falsy schema output %s", async (value) => {
		const { fetch } = recorder(() => jsonResponse({ id: 1 }));
		const api = Http.create("https://inference-falsy.test", { cache: false, fetch, preset: bare });

		expect(await api.get("/users", { schema: schemaReturning(value) })).toBe(value);
	});

	it("infers text and gives schema output precedence over the raw mode", async () => {
		const { fetch } = recorder(() => new Response("42", { headers: { "Content-Type": "text/plain" } }));
		const api = Http.create("https://inference-text.test", { cache: false, fetch });

		const text = await api.get("/value", { responseType: "text" });
		const transformed = await api.get("/value", { responseType: "text", schema: schemaReturning(42) });
		const safe = await api.safe.get("/value", { responseType: "text" });

		expectTypeOf(text.payload).toEqualTypeOf<string>();
		expectTypeOf(transformed.payload).toEqualTypeOf<number>();
		expectTypeOf(safe).toEqualTypeOf<HttpSafeResult<ApplyShape<"envelope", string>>>();
		expect(text.payload).toBe("42");
		expect(transformed.payload).toBe(42);
	});

	it.each(["text", "blob", "arrayBuffer", "stream", "none"] as const)(
		"uses schema output in the envelope for responseType %s",
		async (responseType) => {
			const { fetch } = recorder(() => new Response("42"));
			const api = Http.create("https://inference-schema-modes.test", { cache: false, fetch });
			const result = await api.get("/value", { responseType, schema: schemaReturning("validated") });

			expectTypeOf(result.payload).toEqualTypeOf<string>();
			expect(result.payload).toBe("validated");
		}
	);

	it("infers binary modes across normal, bodied, safe, and primitive requests", async () => {
		const { fetch } = recorder(
			() => new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "application/octet-stream" } })
		);
		const api = Http.create("https://inference-binary.test", { cache: false, fetch, preset: bare });

		const blob = await api.get("/file", { responseType: "blob" });
		const buffer = await api.post("/file", undefined, { responseType: "arrayBuffer" });
		const safe = await api.safe.get("/file", { responseType: "blob" });
		const primitive = await api.request({ method: "GET", endpoint: "/file", responseType: "arrayBuffer" });

		expectTypeOf(blob).toEqualTypeOf<Blob>();
		expectTypeOf(buffer).toEqualTypeOf<ArrayBuffer>();
		expectTypeOf(safe).toEqualTypeOf<HttpSafeResult<Blob>>();
		expectTypeOf(primitive).toEqualTypeOf<ArrayBuffer>();
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.size).toBe(2);
		expect(buffer).toBeInstanceOf(ArrayBuffer);
		expect([...new Uint8Array(buffer)]).toEqual([1, 2]);
		expect(primitive.byteLength).toBe(2);
	});

	it("infers stream and none, including a null stream for an empty response", async () => {
		const { fetch } = recorder(() => new Response("bytes"));
		const api = Http.create("https://inference-stream.test", { cache: false, fetch, preset: bare });
		const empty = Http.create("https://inference-empty.test", {
			cache: false,
			preset: bare,
			fetch: async () => new Response(null, { status: 204 }),
		});

		const stream = await api.get("/stream", { responseType: "stream" });
		const none = await api.request({ method: "GET", endpoint: "/stream", responseType: "none" });
		const nullStream = await empty.head("/stream", { responseType: "stream" });
		const emptyBuffer = await empty.get("/file", { responseType: "arrayBuffer" });

		expectTypeOf(stream).toEqualTypeOf<ReadableStream<Uint8Array> | null>();
		expectTypeOf(none).toEqualTypeOf<undefined>();
		expectTypeOf(nullStream).toEqualTypeOf<ReadableStream<Uint8Array> | null>();
		expect(none).toBeUndefined();
		expect(nullStream).toBeNull();
		expect(emptyBuffer.byteLength).toBe(0);
		expect(await new Response(stream).text()).toBe("bytes");
	});

	it("infers the union for a union-valued response mode", () => {
		const api = Http.create("https://inference-union.test", { cache: false, preset: bare });
		const read = (responseType: "text" | "blob") => api.get("/value", { responseType });

		expectTypeOf(read).returns.toEqualTypeOf<Promise<string | Blob>>();
	});

	it("accepts native header inputs without overriding the instance Content-Type", async () => {
		const { fetch, calls } = recorder();
		const api = Http.create("https://inference-headers.test", {
			cache: false,
			fetch,
			headers: { "Content-Type": "text/plain" },
		});

		await api.post("/value", "hello", { headers: { "X-Record": "yes" } });
		await api.get("/value", { headers: [["X-Tuple", "yes"]] });
		await api.request({ method: "GET", endpoint: "/value", headers: new Headers({ "X-Native": "yes" }) });

		expect(sentHeaders(calls[0]?.init).get("Content-Type")).toBe("text/plain");
		expect(sentHeaders(calls[0]?.init).get("X-Record")).toBe("yes");
		expect(sentHeaders(calls[1]?.init).get("X-Tuple")).toBe("yes");
		expect(sentHeaders(calls[2]?.init).get("X-Native")).toBe("yes");
	});
});
