import type { ResolvedHooks } from "../functions/hooks.js";
import type { HttpRetry } from "../functions/retry.js";
import type {
	HttpConfigConnection,
	HttpConfigDefaults,
	HttpConfigGet,
	HttpConfigInitial,
	HttpConfigInput,
	HttpConfigMethods,
	HttpConfigUpdate,
	HttpHookContext,
	HttpHookName,
	HttpHooks,
	HttpLogger,
	HttpMethods,
	HttpRequestInit,
	HttpRequestMethod,
	HttpSafeMethods,
	HttpSafeResult,
} from "../typing/classes/http.typing.js";
import type { ApplyShape, HttpPreset, ShapeName } from "../typing/classes/preset.typing.js";
// biome-ignore lint/style/useNamingConvention: disambiguates the enum type from the client's HttpMethods map
import type { HttpMethods as HTTPMethods, HttpMethodsLower } from "../typing/enums/methods.js";

import { resolveHooks, runErrorHooks } from "../functions/hooks.js";
import { consoleLogger } from "../functions/log.js";
import { parseBody, parseHeaders } from "../functions/parse.js";
import { execute } from "../functions/request.js";
import { composeSignal } from "../functions/signal.js";
import { normalizeError } from "../functions/throw.js";
import { buildUrl } from "../functions/url.js";
import { envelope } from "../presets/envelope.js";
import { ContentType } from "../typing/enums/content.js";
import { HttpMethodBodyless, HttpMethodLower } from "../typing/enums/methods.js";

const BODYLESS = new Set<string>(HttpMethodBodyless);
const SAFE = "safe";
const safeClients = new WeakMap<object, unknown>();

interface RegisteredClient {
	client: unknown;
	preset: HttpPreset;
	shape: ShapeName;
}

interface ClientDefaults extends HttpConfigDefaults {
	headers: Headers;
	params: Record<string, unknown>;
	logger: HttpLogger;
}

function snapshotRetry(retry?: HttpRetry): HttpRetry | undefined {
	return typeof retry === "object"
		? { ...retry, methods: retry.methods?.slice(), statusCodes: retry.statusCodes?.slice() }
		: retry;
}

function resolveDefaults(config: HttpConfigDefaults): ClientDefaults {
	return {
		headers: parseHeaders(config.headers),
		params: { ...config.params },
		secure: config.secure,
		errorMessage: config.errorMessage,
		log: config.log,
		timeout: config.timeout,
		retry: snapshotRetry(config.retry),
		fetch: config.fetch,
		paramsSerializer: config.paramsSerializer,
		logger: config.logger ?? consoleLogger,
	};
}

function isMethodName(property: string | symbol): property is HttpMethodsLower {
	return typeof property === "string" && Object.hasOwn(HttpMethodLower, property);
}

type RequestCall = (...args: unknown[]) => Promise<unknown>;

function safeCall(call: RequestCall): (...args: unknown[]) => Promise<HttpSafeResult<unknown>> {
	return async (...args: unknown[]) => {
		try {
			return { data: await call(...args), error: undefined };
		} catch (error) {
			return { data: undefined, error: normalizeError(error) };
		}
	};
}

/** Mirrors the HTTP helpers on a separate facade, not the frozen instance. */
function safeMethods<K extends ShapeName>(client: HttpInstance<K>): ProxyHandler<object> {
	const dispatch = methods<K>().get as (target: HttpInstance<K>, property: string) => RequestCall;

	return {
		get(target, property) {
			if (!isMethodName(property)) {
				return Reflect.get(target, property);
			}

			return safeCall(dispatch(client, property));
		},
		has(target, property) {
			return isMethodName(property) || Reflect.has(target, property);
		},
	};
}

/**
 * Maps every lowercase http method onto the single `request()` core, so the
 * per-method signatures live in the type layer instead of in duplicated code.
 */
function methods<K extends ShapeName>(): ProxyHandler<HttpInstance<K>> {
	return {
		get(target, property) {
			if (property === SAFE) {
				const cached = safeClients.get(target);

				if (cached) {
					return cached;
				}

				// The frozen client owns request; its proxy cannot substitute a different function.
				const facade = Object.freeze({ request: safeCall(target.request as RequestCall) });
				const safe = new Proxy(facade, safeMethods(target)) as HttpSafeMethods<K>;

				safeClients.set(target, safe);

				return safe;
			}

			if (!isMethodName(property)) {
				return Reflect.get(target, property);
			}

			const method = property.toUpperCase() as HTTPMethods;
			const bodyless = BODYLESS.has(property);

			return <T, R, P = object>(
				endpoint: string,
				payload?: T | HttpConfigGet<P>,
				options?: HttpConfigMethods<T, P>
			): Promise<ApplyShape<K, R>> => {
				const config = (bodyless ? (payload as HttpConfigGet<P>) : options) ?? {};

				return target.request<T, R, P>({
					...config,
					method,
					endpoint,
					...(bodyless ? {} : { body: payload as T }),
				});
			};
		},
		has(target, property) {
			return property === SAFE || isMethodName(property) || Reflect.has(target, property);
		},
	};
}

export class HttpInstance<K extends ShapeName = "envelope"> {
	readonly #api: string;
	#defaults: ClientDefaults;
	readonly #preset: HttpPreset<K>;
	#hooks: ResolvedHooks;

	static readonly #instances = new Map<string, RegisteredClient>();

	private constructor(api: string, config?: HttpConfigInitial<K>) {
		const preset = config?.preset ?? (envelope as HttpPreset<ShapeName> as HttpPreset<K>);

		this.#api = api;
		this.#defaults = resolveDefaults(config ?? {});
		this.#preset = {
			name: preset.name,
			shape: preset.shape,
			unwrap: preset.unwrap?.slice(),
			validate: preset.validate.bind(preset),
			build: preset.build.bind(preset),
		};
		this.#hooks = resolveHooks(config?.hooks);

		Object.freeze(this);
	}

	static create<K extends ShapeName>(
		api: string,
		config: HttpConfigInitial<K> & { preset: HttpPreset<K> }
	): HttpClient<K>;
	static create(api: string, config?: HttpConfigInitial<"envelope">): HttpClient<"envelope">;
	static create<K extends ShapeName = "envelope">(api: string, config?: HttpConfigInitial<K>): HttpClient<K> {
		const shared = config?.cache !== false;
		const cached = shared ? HttpInstance.#instances.get(api) : undefined;

		if (cached) {
			const expectedShape = config?.preset?.shape ?? "envelope";

			if (cached.shape !== expectedShape || (config?.preset && config.preset !== cached.preset)) {
				throw new TypeError("Preset conflict for this API. Pass its original preset or use cache: false.");
			}

			return cached.client as HttpClient<K>;
		}

		const created = new Proxy(new HttpInstance<K>(api, config), methods<K>()) as HttpClient<K>;

		if (shared) {
			const preset = config?.preset ?? envelope;

			HttpInstance.#instances.set(api, { client: created, preset, shape: preset.shape });
		}

		return created;
	}

	/** Headers are owned by this request, so merging needs no second copy. */
	#makeHeaders<T, P>(config: HttpConfigConnection<T, P>, defaults: ClientDefaults, bodyless: boolean): void {
		const requestHeaders = config.headers;

		if (bodyless) {
			requestHeaders.delete("Content-Type");
		} else if (!requestHeaders.has("Content-Type")) {
			requestHeaders.set(
				"Content-Type",
				config.type ?? defaults.headers.get("Content-Type") ?? ContentType.APPLICATION_JSON
			);
		}

		for (const [key, value] of defaults.headers) {
			if (bodyless && key === "content-type") {
				continue;
			}
			if (!requestHeaders.has(key)) {
				requestHeaders.set(key, value);
			}
		}

		if (!config.secure) {
			requestHeaders.delete("Authorization");
		}
	}

	#makeRequest<T, P>(config: HttpConfigConnection<T, P>, defaults: ClientDefaults, bodyless: boolean) {
		// Strips library-only options so the rest can pass through to RequestInit.
		const {
			body: B,
			params: PA,
			type: C,
			log: L,
			errorMessage: EM,
			headers: H,
			secure: S,
			thrower: TR,
			clone: CL,
			responseType: RT,
			paramsSerializer: PS,
			timeout: TO,
			schema: SC,
			retry: RE,
			onDownloadProgress: DP,
			endpoint,
			method,
			signal,
			...options
		} = config;
		const body = bodyless ? undefined : parseBody(config).body;

		const request: HttpRequestInit = {
			method,
			headers: config.headers,
			...options,
			...(bodyless ? {} : { body }),
			...(body instanceof ReadableStream ? { duplex: options.duplex ?? "half" } : {}),
			...(signal ? { signal } : {}),
		};

		const url = buildUrl({
			baseUrl: this.#api,
			endpoint,
			params: { ...defaults.params, ...(config.params as Record<string, unknown> | undefined) },
			serializer: config.paramsSerializer ?? defaults.paramsSerializer,
		});

		return { url, config: request };
	}

	/**
	 * Updates defaults for future requests through every reference to this client.
	 * Supplied collections replace the old ones; explicit undefined resets a field.
	 */
	public configure = (update: HttpConfigUpdate): void => {
		if ("preset" in update || "cache" in update || "hooks" in update) {
			throw new TypeError("configure() accepts defaults only. Use hook() for hooks; presets are fixed.");
		}

		// Replace the snapshot atomically, after normalization succeeds.
		this.#defaults = resolveDefaults({ ...this.#defaults, ...update });
	};

	/** Registers a hook and returns a function that removes it again. */
	public hook = <N extends HttpHookName>(name: N, handler: NonNullable<HttpHooks[N]>[number]): (() => void) => {
		const handlers = this.#hooks[name] as unknown[];
		// Duplicate callbacks need distinct subscription identities, without wrapping ordinary hooks.
		const registered = handlers.includes(handler) ? handler.bind(undefined) : handler;
		this.#hooks = { ...this.#hooks, [name]: [...handlers, registered] };
		let active = true;

		return () => {
			if (!active) {
				return;
			}
			active = false;
			const current = this.#hooks[name] as unknown[];
			const index = current.indexOf(registered);

			if (index >= 0) {
				this.#hooks = { ...this.#hooks, [name]: [...current.slice(0, index), ...current.slice(index + 1)] };
			}
		};
	};

	/**
	 * Public primitive. The proxied http methods delegate here, and this is the
	 * only place that talks to the transport core.
	 */
	// The overloads describe the same parser/schema pipeline for every proxied method.
	public request = (async <T, R, P = object>(input: HttpConfigInput<T, P>): Promise<ApplyShape<K, R>> => {
		const defaults = this.#defaults;
		// Hook lists change only on subscription updates; each request keeps this immutable snapshot.
		const hooks = this.#hooks;
		const log = input.log ?? defaults.log;
		let context: HttpHookContext | undefined;

		try {
			const signal = composeSignal(input.signal, input.timeout ?? defaults.timeout);
			const config: HttpConfigConnection<T, P> = {
				...input,
				secure: input.secure ?? defaults.secure ?? true,
				errorMessage: input.errorMessage ?? defaults.errorMessage,
				log,
				retry: snapshotRetry(input.retry ?? defaults.retry),
				headers: parseHeaders(input.headers),
				...(signal ? { signal } : {}),
			};
			const bodyless = BODYLESS.has(config.method.toLowerCase());
			this.#makeHeaders(config, defaults, bodyless);
			const prepared = this.#makeRequest(config, defaults, bodyless);

			context = { url: prepared.url, init: prepared.config };

			const response = await execute<R, K>({
				url: prepared.url,
				init: prepared.config,
				preset: this.#preset,
				fetch: defaults.fetch,
				thrower: config.thrower,
				clone: config.clone,
				responseType: config.responseType,
				schema: config.schema,
				retry: config.retry,
				onDownloadProgress: config.onDownloadProgress,
				errorMessage: config.errorMessage,
				log: config.log,
				hooks,
				logger: defaults.logger,
				onContext: (resolved) => {
					context = resolved;
				},
			});

			return response;
		} catch (error) {
			const normalized = normalizeError(error);
			const failed = context ?? {
				url: input.endpoint,
				init: { method: input.method, headers: new Headers() },
			};

			if (log) {
				defaults.logger.error?.({ ...failed, error: normalized });
			}

			throw hooks.error.length ? await runErrorHooks(hooks.error, normalized, failed) : normalized;
		}
	}) as HttpRequestMethod<K>;
}

/** What `Http.create()` hands back: the instance plus its proxied http methods. */
export type HttpClient<K extends ShapeName = "envelope"> = HttpInstance<K> &
	HttpMethods<K> & { safe: HttpSafeMethods<K> };
