import type { HttpPreset, StandardSchemaV1 } from "../../../src/index.js";
import type { ExampleText, Scenario } from "../i18n/examples.js";

import { bare, envelope, Http, problem, rest, ServiceError } from "../../../src/index.js";

const JSON_LIMIT = 16_384;
const RETRIES = 2;
const presets: Record<string, HttpPreset> = { envelope, bare, rest, problem };
interface DemoContext {
	base: string;
	signal: AbortSignal;
	form: FormData;
	text: ExampleText;
	log: (message: string) => void;
	result: (value: unknown) => void;
	progress: (loaded: number, total?: number) => void;
}
function field(context: DemoContext, name: string): string {
	return String(context.form.get(name) ?? "");
}
function client(context: DemoContext) {
	return Http.create(context.base, {
		cache: false,
		secure: false,
		preset: presets[field(context, "preset")] ?? envelope,
	});
}
function errorResult(error: unknown, text: ExampleText) {
	if (error instanceof Error && error.name === "TimeoutError") {
		return { message: text.timeout };
	}
	if (error instanceof TypeError) {
		return { message: text.network };
	}
	if (error instanceof ServiceError) {
		return { name: error.name, status: error.status, code: error.code, message: error.message, errors: error.errors };
	}
	return { message: error instanceof Error ? error.message : text.network };
}
async function jsonDemo(context: DemoContext) {
	const api = client(context);
	const { signal } = context;
	if (field(context, "method") === "POST") {
		const source = field(context, "body");
		if (new TextEncoder().encode(source).byteLength > JSON_LIMIT) {
			throw new Error(context.text.jsonLimit);
		}
		let body: unknown;
		try {
			body = JSON.parse(source);
		} catch {
			throw new Error(context.text.invalidJson);
		}
		return await api.post("echo", JSON.stringify(body), { signal });
	}
	return await api.get("echo", { signal, params: { name: field(context, "name") } });
}
async function schemaDemo(context: DemoContext) {
	const numeric = context.form.has("invalid");
	const schema: StandardSchemaV1 = {
		"~standard": {
			version: 1,
			vendor: "live-demo",
			validate(value) {
				const valid =
					typeof value === "object" &&
					value !== null &&
					"name" in value &&
					typeof value.name === (numeric ? "number" : "string");
				return valid
					? { value }
					: { issues: [{ message: numeric ? context.text.schemaNumber : context.text.schemaIssue }] };
			},
		},
	};
	const api = Http.create(context.base, { cache: false, secure: false, preset: envelope });
	return await api.get("echo", { signal: context.signal, params: { name: field(context, "name") }, schema });
}
async function traceDemo(context: DemoContext, retry: boolean) {
	let attempt = 0;
	const api = Http.create(context.base, {
		cache: false,
		secure: false,
		preset: envelope,
		hooks: {
			request: [
				() => {
					context.log(context.text.requestHook);
				},
			],
			response: [
				(response) => {
					context.log(`${context.text.responseHook}: ${response.status}`);
				},
			],
			error: [
				() => {
					context.log(context.text.errorHook);
				},
			],
		},
		fetch: (input, init) => {
			attempt += 1;
			const headers = new Headers(init?.headers);
			headers.set("X-Demo-Attempt", String(attempt));
			context.log(`${context.text.attempt}: ${attempt}`);
			return globalThis.fetch(input, { ...init, headers });
		},
	});
	// Hooks surround the logical request; only the transport runs once per attempt.
	return await api.get(retry ? "retry" : "echo", {
		signal: context.signal,
		retry: retry ? { attempts: RETRIES, respectRetryAfter: true } : 0,
		params: retry ? {} : { name: field(context, "name") },
	});
}
async function requestDemo(scenario: Scenario, context: DemoContext): Promise<unknown> {
	switch (scenario) {
		case "json":
			return await jsonDemo(context);
		case "schema":
			return await schemaDemo(context);
		case "hooks":
			return await traceDemo(context, false);
		case "retry":
			return await traceDemo(context, true);
		case "safe": {
			const [error, data] = await client(context).safe.get("status", {
				signal: context.signal,
				params: { code: field(context, "status") },
			});
			if (error) {
				context.signal.throwIfAborted();
				context.log(context.text.safeError);
				return { error: errorResult(error, context.text), data: null };
			}
			return { error: null, data };
		}
		case "timing":
			return await client(context).get("delay", {
				signal: context.signal,
				params: { ms: field(context, "delay") },
				timeout: Number(field(context, "deadline")),
			});
		default:
			throw new Error(context.text.failed);
	}
}

export type { DemoContext };
export { client, errorResult, field, requestDemo };
