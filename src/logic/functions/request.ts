import type {
	HttpHookContext,
	HttpLogger,
	HttpProgressHandler,
	HttpRequestInit,
} from "../typing/classes/http.typing.js";
import type {
	ApplyShape,
	HttpFetch,
	HttpPreset,
	HttpResponseType,
	HttpThrower,
	ResponseContext,
	ResponseKind,
	ShapeName,
} from "../typing/classes/preset.typing.js";
import type { StandardSchemaV1 } from "../typing/classes/schema.typing.js";
import type { ResolvedHooks } from "./hooks.js";
import type { HttpRetry } from "./retry.js";

import { ServiceError } from "../classes/errors.js";
import { unwrapKeys } from "../presets/create.js";
import { runRequestHooks, runResponseHooks } from "./hooks.js";
import { withProgress } from "./progress.js";
import { canRetry, delayFor, resolveRetry, shouldRetryResponse, wait } from "./retry.js";
import { issuesToErrors, validateSchema } from "./schema.js";
import { detectResponseKind } from "./validation.js";

export interface ExecuteOptions<K extends ShapeName> {
	url: string;
	init: HttpRequestInit;
	preset: HttpPreset<K>;
	fetch?: HttpFetch;
	thrower?: HttpThrower;
	clone?: boolean;
	arrayBuffer?: boolean;
	responseType?: HttpResponseType;
	errorMessage?: string;
	log?: boolean;
	hooks?: ResolvedHooks;
	logger?: HttpLogger;
	schema?: StandardSchemaV1<unknown, unknown>;
	retry?: HttpRetry;
	onDownloadProgress?: HttpProgressHandler;
	/** Reports the context after request hooks ran, so callers can reuse it. */
	onContext?: (context: HttpHookContext) => void;
}

const STATUS_NO_CONTENT = 204;
const STATUS_RESET_CONTENT = 205;
const STATUS_NOT_MODIFIED = 304;
const ERROR_BODY_PREVIEW = 200;

const EMPTY_STATUS = new Set([STATUS_NO_CONTENT, STATUS_RESET_CONTENT, STATUS_NOT_MODIFIED]);

const FORCED: Record<Exclude<HttpResponseType, "auto">, ResponseKind> = {
	json: "json",
	text: "text",
	blob: "file",
	arrayBuffer: "file",
	stream: "stream",
	none: "empty",
};

function resolveKind(response: Response, responseType: HttpResponseType = "auto"): ResponseKind {
	if (responseType !== "auto") {
		return FORCED[responseType];
	}

	if (EMPTY_STATUS.has(response.status)) {
		return "empty";
	}
	if (response.headers.get("Content-Length") === "0") {
		return "empty";
	}
	if (!response.body) {
		return "empty";
	}

	return detectResponseKind(response.headers.get("Content-Type"));
}

/** Cloning costs a buffered copy, so only small textual bodies clone by default. */
function shouldClone(kind: ResponseKind, explicit?: boolean): boolean {
	if (explicit !== undefined) {
		return explicit;
	}

	return kind === "json" || kind === "text";
}

async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();

	if (!text) {
		return undefined;
	}

	try {
		return JSON.parse(text);
	} catch (error) {
		throw new ServiceError(
			{
				message: "Failed to parse the response as json",
				status: response.status,
				statusText: `${response.status}: ${response.statusText}`,
				errors: { description: text.slice(0, ERROR_BODY_PREVIEW) },
				code: "ERR_INVALID_JSON",
				response,
			},
			{ cause: error }
		);
	}
}

/**
 * Re-sends on retryable statuses and network errors. Request hooks are not
 * re-run, and a streamed body cannot be replayed.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: retry is a flat state machine; splitting it hides the control flow
async function send(fetcher: HttpFetch, context: HttpHookContext, retry?: HttpRetry): Promise<Response> {
	const options = resolveRetry(retry);

	if (!options) {
		return fetcher(context.url, context.init);
	}

	let attempt = 0;

	for (;;) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: retries are sequential by definition
			const response = await fetcher(context.url, context.init);

			if (!shouldRetryResponse(options, response)) {
				return response;
			}
			if (!canRetry(options, attempt, context.init.method)) {
				return response;
			}

			await wait(delayFor(options, attempt, response));
		} catch (error) {
			if (!canRetry(options, attempt, context.init.method)) {
				throw error;
			}
			if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
				throw error;
			}

			await wait(delayFor(options, attempt));
		}

		attempt += 1;
	}
}

function readBody(response: Response, kind: ResponseKind, arrayBuffer?: boolean): Promise<unknown> {
	if (kind === "json") {
		return readJson(response);
	}
	if (kind === "file") {
		return arrayBuffer ? response.arrayBuffer() : response.blob();
	}
	if (kind === "text") {
		return response.text();
	}
	if (kind === "stream") {
		return Promise.resolve(response.body);
	}

	return Promise.resolve(undefined);
}

/**
 * Adapts a preset's validate() to the `thrower` signature, so a custom thrower
 * can delegate to the preset's conventions instead of reimplementing them.
 */
export function presetThrower<K extends ShapeName>(preset: HttpPreset<K>, errorMessage?: string): HttpThrower {
	return ({ json, response }) => {
		const error = preset.validate({
			response,
			status: response.status,
			kind: "json",
			body: json,
			errorMessage,
		});

		if (error) {
			throw new ServiceError(error);
		}
	};
}

/**
 * Transport core: hooks, send, read, validate, shape. Holds no configuration
 * of its own, so it can be driven directly by tests with an injected `fetch`.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the request pipeline is linear; each branch is one documented stage
export async function execute<R, K extends ShapeName>(options: ExecuteOptions<K>): Promise<ApplyShape<K, R>> {
	const {
		url,
		init,
		preset,
		fetch: custom,
		thrower,
		clone,
		arrayBuffer,
		responseType,
		errorMessage,
		log,
		hooks,
		logger,
		onContext,
		schema,
		retry,
		onDownloadProgress,
	} = options;

	const fetcher: HttpFetch = custom ?? ((input, config) => globalThis.fetch(input, config));
	const started = Date.now();

	const prepared = await runRequestHooks(hooks?.request ?? [], { url, init });
	const { context } = prepared;

	onContext?.(context);

	if (log) {
		logger?.request?.(context);
	}

	const sent = prepared.response ?? (await send(fetcher, context, retry));
	const hooked = await runResponseHooks(hooks?.response ?? [], sent, context);
	const response = onDownloadProgress ? withProgress(hooked, onDownloadProgress) : hooked;

	const kind = resolveKind(response, responseType);
	// Read the original, hand back the clone.
	const returnable = shouldClone(kind, clone) ? response.clone() : response;
	const body = await readBody(response, kind, arrayBuffer ?? responseType === "arrayBuffer");

	if (log) {
		logger?.response?.({
			...context,
			response: returnable,
			body,
			duration: Date.now() - started,
		});
	}

	const resolved: ResponseContext = {
		response: returnable,
		status: returnable.status,
		kind,
		body,
		errorMessage,
	};

	if (thrower) {
		thrower({
			json: (kind === "json" ? body : {}) as Record<string, unknown>,
			response: returnable,
		});
	} else {
		const error = preset.validate(resolved);

		if (error) {
			throw new ServiceError({
				...error,
				response: error.response ?? returnable,
				request: error.request ?? { url: context.url, method: context.init.method },
			});
		}
	}

	if (schema) {
		const result = await validateSchema(schema, unwrapKeys(body, preset.unwrap ?? []));

		if (result.issues) {
			throw new ServiceError({
				message: "Response failed schema validation",
				status: returnable.status,
				statusText: `${returnable.status}: ${returnable.statusText}`,
				errors: issuesToErrors(result.issues),
				code: "ERR_SCHEMA",
				response: returnable,
				request: { url: context.url, method: context.init.method },
			});
		}

		resolved.payload = result.value;
	}

	return preset.build<R>(resolved);
}
