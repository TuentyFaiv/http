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
	HttpErrorInit,
	HttpFetch,
	HttpParamsSerializer,
	HttpPreset,
	HttpResponseType,
	HttpShapes,
	HttpThrower,
	ShapeName,
} from "./preset.typing.js";
import type { StandardSchemaV1 } from "./schema.typing.js";

type ExcludeFields = "method" | "endpoint" | "body";
type GlobalOptions = "secure" | "errorMessage" | "log" | "timeout" | "retry";

export type HttpMethods<K extends ShapeName = "envelope"> = {
	[KEY in Exclude<HttpMethodLower, HttpMethodBodyless>]: <T, R, P = undefined>(
		endpoint: string,
		body?: T,
		config?: HttpConfigMethods<T, P>
	) => Promise<ApplyShape<K, R>>;
} & {
	[KEY in HttpMethodBodyless]: <R, P = undefined>(
		endpoint: string,
		config?: HttpConfigGet<P>
	) => Promise<ApplyShape<K, R>>;
};

/** Go-style result: exactly one of the two slots is populated. */
export type HttpSafeResult<T> = readonly [error: Error, data: undefined] | readonly [error: undefined, data: T];

export type HttpSafeMethods<K extends ShapeName = "envelope"> = {
	[KEY in Exclude<HttpMethodLower, HttpMethodBodyless>]: <T, R, P = undefined>(
		endpoint: string,
		body?: T,
		config?: HttpConfigMethods<T, P>
	) => Promise<HttpSafeResult<ApplyShape<K, R>>>;
} & {
	[KEY in HttpMethodBodyless]: <R, P = undefined>(
		endpoint: string,
		config?: HttpConfigGet<P>
	) => Promise<HttpSafeResult<ApplyShape<K, R>>>;
};

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
	/** Bytes received so far. */
	loaded: number;
	/** Total bytes, when the response declares Content-Length. */
	total?: number;
	/** 0-100, only when `total` is known. */
	percent?: number;
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

export interface HttpConfigInitial<K extends ShapeName = "envelope"> extends HttpGlobalConfig {
	headers?: HeadersInit;
	params?: Record<string, unknown>;
	/** Decides what counts as an error and what shape results take. Defaults to `envelope`. */
	preset?: HttpPreset<K>;
	/** Replace the transport. Defaults to `globalThis.fetch`, resolved per call. */
	fetch?: HttpFetch;
	/** Overrides how query params are turned into a query string. */
	paramsSerializer?: HttpParamsSerializer;
	/**
	 * Reuse the instance cached for this base url. Defaults to true. Set false
	 * on the server: a cached instance shares mutated headers across concurrent
	 * requests, which can leak one user's Authorization into another's request.
	 */
	cache?: boolean;
	hooks?: HttpHooks;
	/** Replaces the built-in console logger used when `log` is on. */
	logger?: HttpLogger;
}

export interface HttpConfigRequest<T> extends Omit<RequestInit, "body"> {
	signal?: AbortSignal;
	body?: T | FormData;
	method: HttpMethod;
	headers: Headers;
}

/** What actually gets handed to fetch. */
export type HttpRequestInit = Omit<RequestInit, "headers"> & {
	method: HttpMethod;
	headers: Headers;
};

export interface HttpConfigConnection<T, P = undefined> extends HttpConfigRequest<T> {
	params?: P;
	type?: ContentTypes;
	secure: boolean;
	endpoint: string;
	errorMessage?: string;
	arrayBuffer?: boolean;
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
	/** Reports bytes as the response body arrives. Upload progress is not supported. */
	onDownloadProgress?: HttpProgressHandler;
}

export type HttpConfigMethods<T, P> = Partial<Omit<HttpConfigConnection<T, P>, ExcludeFields>>;
export type HttpConfigGet<P> = HttpConfigMethods<never, P>;

/** Input accepted by the public `request()` primitive the sugar methods delegate to. */
export type HttpConfigInput<T, P = undefined> = Partial<Omit<HttpConfigConnection<T, P>, "method" | "endpoint">> & {
	method: HttpMethod;
	endpoint: string;
};

export type HttpConnectionReturn<T> = HttpShapes<T>["envelope"];

export type HttpConnectionError = HttpErrorInit;

export interface HttpStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface HttpStorageAsync {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}
