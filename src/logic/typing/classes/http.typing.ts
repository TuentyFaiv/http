// biome-ignore-all lint/suspicious/noConfusingVoidType: hooks may return nothing, so `void` is the ergonomic union member
import type { HttpRetry } from "../../functions/retry.js";
import type { ContentTypes } from "../enums/content.js";
import type {
	HttpMethods as HttpMethod,
	HttpMethodsBodyless as HttpMethodBodyless,
	HttpMethodsLower as HttpMethodLower,
} from "../enums/methods.js";
import type {
	ApplyShape,
	HttpFetch,
	HttpFetchInit,
	HttpParamsSerializer,
	HttpPreset,
	HttpResponsePayload,
	HttpResponseType,
	HttpThrower,
	ShapeName,
} from "./preset.typing.js";
import type { InferSchemaOutput, StandardSchemaV1 } from "./schema.typing.js";

type ExcludeFields = "method" | "endpoint" | "body";
type GlobalOptions = "secure" | "errorMessage" | "log" | "timeout" | "retry";

type MethodResult<K extends ShapeName, R, SAFE extends boolean> = SAFE extends true
	? HttpSafeResult<ApplyShape<K, R>>
	: ApplyShape<K, R>;

type SchemaOptions<S extends StandardSchemaV1> = { schema: S };
type ResponseOptions<M extends HttpResponseType> = { responseType: M; schema?: undefined };

/** Inference order: validated output, explicit parser, caller-supplied response type. */
interface BodylessMethod<K extends ShapeName, SAFE extends boolean> {
	<S extends StandardSchemaV1, P = object>(
		endpoint: string,
		config: HttpConfigGet<P> & SchemaOptions<S>
	): Promise<MethodResult<K, InferSchemaOutput<S>, SAFE>>;
	<M extends HttpResponseType, P = object>(
		endpoint: string,
		config: HttpConfigGet<P> & ResponseOptions<M>
	): Promise<MethodResult<K, HttpResponsePayload<M>, SAFE>>;
	<R = unknown, P = object>(endpoint: string, config?: HttpConfigGet<P>): Promise<MethodResult<K, R, SAFE>>;
}

interface BodyMethod<K extends ShapeName, SAFE extends boolean> {
	<T, S extends StandardSchemaV1, P = object>(
		endpoint: string,
		body: T | undefined,
		config: HttpConfigMethods<T, P> & SchemaOptions<S>
	): Promise<MethodResult<K, InferSchemaOutput<S>, SAFE>>;
	<T, M extends HttpResponseType, P = object>(
		endpoint: string,
		body: T | undefined,
		config: HttpConfigMethods<T, P> & ResponseOptions<M>
	): Promise<MethodResult<K, HttpResponsePayload<M>, SAFE>>;
	<T = unknown, R = unknown, P = object>(
		endpoint: string,
		body?: T,
		config?: HttpConfigMethods<T, P>
	): Promise<MethodResult<K, R, SAFE>>;
}

type ClientMethods<K extends ShapeName, SAFE extends boolean> = {
	[KEY in Exclude<HttpMethodLower, HttpMethodBodyless>]: BodyMethod<K, SAFE>;
} & {
	[KEY in HttpMethodBodyless]: BodylessMethod<K, SAFE>;
};

export type HttpMethods<K extends ShapeName = "envelope"> = ClientMethods<K, false>;

/** Safe result: check `error` to narrow `data` to the unchanged preset shape. */
export type HttpSafeResult<T> =
	| { readonly data: T; readonly error: undefined }
	| { readonly data: undefined; readonly error: Error };

export type HttpSafeMethods<K extends ShapeName = "envelope"> = ClientMethods<K, true> & {
	readonly request: HttpSafeRequestMethod<K>;
};

interface RequestMethod<K extends ShapeName, SAFE extends boolean> {
	<T, S extends StandardSchemaV1, P = object>(
		input: HttpConfigInput<T, P> & SchemaOptions<S>
	): Promise<MethodResult<K, InferSchemaOutput<S>, SAFE>>;
	<T, M extends HttpResponseType, P = object>(
		input: HttpConfigInput<T, P> & ResponseOptions<M>
	): Promise<MethodResult<K, HttpResponsePayload<M>, SAFE>>;
	<T = unknown, R = unknown, P = object>(input: HttpConfigInput<T, P>): Promise<MethodResult<K, R, SAFE>>;
}

export type HttpRequestMethod<K extends ShapeName = "envelope"> = RequestMethod<K, false>;
export type HttpSafeRequestMethod<K extends ShapeName = "envelope"> = RequestMethod<K, true>;

export type HttpGlobalConfig = Partial<Pick<HttpConfigConnection<unknown>, GlobalOptions>>;

/** What a request hook can read and replace before the request is sent. */
export interface HttpHookContext {
	url: string;
	init: HttpRequestInit;
}

/**
 * Runs before the request. Return a context to replace url/init, a Response to
 * short-circuit the request entirely, or nothing to leave it untouched.
 */
export type HttpRequestHook = (
	context: HttpHookContext
) => void | HttpHookContext | Response | Promise<void | HttpHookContext | Response>;

/** Runs after the response arrives. Return a Response to replace it. */
export type HttpResponseHook = (
	response: Response,
	context: HttpHookContext
) => void | Response | Promise<void | Response>;

/** Runs when a request fails. Return an Error to replace the one thrown. */
export type HttpErrorHook = (error: Error, context: HttpHookContext) => void | Error | Promise<void | Error>;

export interface HttpHooks {
	request?: HttpRequestHook[];
	response?: HttpResponseHook[];
	error?: HttpErrorHook[];
}

export type HttpHookName = keyof HttpHooks;

export interface HttpProgress {
	/** Bytes received so far, or server-acknowledged bytes for `uploadConfirmed`. */
	loaded: number;
	/** Total bytes when known: response Content-Length or the upload Blob size. */
	total?: number;
	/** 0-100, only when `total` is known. */
	percent?: number;
	/** Body reading finished, or the final upload chunk was acknowledged. Not business acceptance. */
	done: boolean;
}

export type HttpProgressHandler = (progress: HttpProgress) => void;

export interface HttpLogger {
	request?(event: HttpHookContext): void;
	response?(
		event: HttpHookContext & {
			response: Response;
			body: unknown;
			duration: number;
		}
	): void;
	error?(event: HttpHookContext & { error: Error }): void;
}

/** Mutable defaults. Updates replace supplied fields; omitted fields are retained. */
export interface HttpConfigDefaults extends HttpGlobalConfig {
	headers?: HeadersInit;
	params?: Record<string, unknown>;
	/** Replace the transport. Defaults to `globalThis.fetch`, resolved per call. */
	fetch?: HttpFetch;
	/** Overrides how query params are turned into a query string. */
	paramsSerializer?: HttpParamsSerializer;
	/** Replaces the built-in console logger used when `log` is on. */
	logger?: HttpLogger;
}

/** Identity and hook registration cannot be changed through a defaults update. */
export type HttpConfigUpdate = HttpConfigDefaults & {
	preset?: never;
	cache?: never;
	hooks?: never;
};

export interface HttpConfigInitial<K extends ShapeName = "envelope"> extends HttpConfigDefaults {
	/** Fixed for the client's lifetime. Reuse this preset object when retrieving a custom client. */
	preset?: HttpPreset<K>;
	/**
	 * Share one in-memory client per exact base URL. Defaults to true.
	 * Set false for an unregistered client, especially for per-user SSR state.
	 */
	cache?: boolean;
	hooks?: HttpHooks;
}

export interface HttpConfigRequest<T> extends Omit<HttpFetchInit, "body"> {
	signal?: AbortSignal;
	body?: T | FormData;
	method: HttpMethod;
	headers: Headers;
}

/** What actually gets handed to fetch. */
export type HttpRequestInit = Omit<HttpFetchInit, "headers"> & {
	method: HttpMethod;
	headers: Headers;
};

export interface HttpConfigConnection<T, P = object> extends HttpConfigRequest<T> {
	params?: P;
	type?: ContentTypes;
	secure: boolean;
	endpoint: string;
	errorMessage?: string;
	/** Escape hatch that replaces the preset's validation for one request. */
	thrower?: HttpThrower;
	clone?: boolean;
	log?: boolean;
	/** Forces how the body is read instead of inferring it. */
	responseType?: HttpResponseType;
	paramsSerializer?: HttpParamsSerializer;
	/** Aborts the request after this many milliseconds. */
	timeout?: number;
	/** Validates the payload with any Standard Schema library (zod, valibot, arktype). */
	schema?: StandardSchemaV1<unknown, unknown>;
	/** Attempt count, or full retry options. Off by default. */
	retry?: HttpRetry;
	/** Reports bytes as the response body arrives. For server-confirmed uploads, use uploadConfirmed. */
	onDownloadProgress?: HttpProgressHandler;
}

export type HttpConfigMethods<T = unknown, P = object> = Partial<
	Omit<HttpConfigConnection<T, P>, ExcludeFields | "headers">
> & { headers?: HeadersInit };
export type HttpConfigGet<P = object> = HttpConfigMethods<never, P>;

/** Input accepted by the public `request()` primitive the sugar methods delegate to. */
export type HttpConfigInput<T = unknown, P = object> = HttpConfigMethods<T, P> & {
	method: HttpMethod;
	endpoint: string;
	body?: T | FormData;
};
