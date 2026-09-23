import type { ResolvedHooks } from "../functions/hooks.js";
import type {
	HttpConfigConnection,
	HttpConfigGet,
	HttpConfigInitial,
	HttpConfigInput,
	HttpConfigMethods,
	HttpGlobalConfig,
	HttpHookContext,
	HttpHookName,
	HttpHooks,
	HttpLogger,
	HttpMethods,
	HttpRequestInit,
	HttpSafeMethods,
} from "../typing/classes/http.typing.js";
import type {
	ApplyShape,
	HttpFetch,
	HttpParamsSerializer,
	HttpPreset,
	ShapeName,
} from "../typing/classes/preset.typing.js";
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

function isMethodName(property: string | symbol): property is HttpMethodsLower {
	return typeof property === "string" && (Object.values(HttpMethodLower) as string[]).includes(property);
}

/**
 * Maps every lowercase http method onto the single `request()` core, so the
 * per-method signatures live in the type layer instead of in duplicated code.
 */
/**
 * Mirrors the http methods, resolving to `[error, data]` instead of throwing.
 */
function safeMethods<K extends ShapeName>(): ProxyHandler<HttpInstance<K>> {
	const dispatch = methods<K>().get as (
		target: HttpInstance<K>,
		property: string
	) => (...args: unknown[]) => Promise<unknown>;

	return {
		get(target, property) {
			if (!isMethodName(property)) {
				return Reflect.get(target, property);
			}

			const call = dispatch(target, property);

			return async (...args: unknown[]) => {
				try {
					return [undefined, await call(...args)];
				} catch (error) {
					return [normalizeError(error), undefined];
				}
			};
		},
	};
}

function methods<K extends ShapeName>(): ProxyHandler<HttpInstance<K>> {
	return {
		get(target, property) {
			if (property === SAFE) {
				const cached = safeClients.get(target);

				if (cached) {
					return cached;
				}

				const safe = new Proxy(target, safeMethods<K>());

				safeClients.set(target, safe);

				return safe;
			}

			if (!isMethodName(property)) {
				return Reflect.get(target, property);
			}

			const method = property.toUpperCase() as HTTPMethods;
			const bodyless = BODYLESS.has(property);

			return <T, R, P = undefined>(
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
	readonly #headers: Headers;
	readonly #params: Required<HttpConfigInitial>["params"];
	readonly #config: HttpGlobalConfig;
	readonly #preset: HttpPreset<K>;
	readonly #fetch: HttpFetch | undefined;
	readonly #paramsSerializer: HttpParamsSerializer | undefined;
	readonly #hooks: ResolvedHooks;
	readonly #logger: HttpLogger;

	static instance = new Map<string, unknown>();

	private constructor(api: string, config?: HttpConfigInitial<K>) {
		this.#config = {
			errorMessage: config?.errorMessage,
			secure: config?.secure,
			log: config?.log,
			timeout: config?.timeout,
			retry: config?.retry,
		};
		this.#api = api;
		this.#preset = config?.preset ?? (envelope as HttpPreset<ShapeName> as HttpPreset<K>);
		this.#fetch = config?.fetch;
		this.#paramsSerializer = config?.paramsSerializer;
		this.#hooks = resolveHooks(config?.hooks);
		this.#logger = config?.logger ?? consoleLogger;

		this.#params = config?.params ?? {};
		this.#headers = parseHeaders(config?.headers);

		Object.freeze(this);
	}

	static create<K extends ShapeName = "envelope">(api: string, config?: HttpConfigInitial<K>): HttpClient<K> {
		const shared = config?.cache !== false;
		const cached = HttpInstance.instance.get(api);

		if (shared && cached) {
			return cached as HttpClient<K>;
		}

		const created = new Proxy(new HttpInstance<K>(api, config), methods<K>()) as HttpClient<K>;

		if (shared) {
			HttpInstance.instance.set(api, created);
		}

		return created;
	}

	#makeHeaders<T, P>(config: HttpConfigConnection<T, P>): HttpConfigConnection<T, P> {
		const { headers, type } = config;
		const requestHeaders = new Headers(headers);
		const preConfigHeaders = new Headers(this.#headers);

		const content = type ?? this.#headers.get("Content-Type") ?? ContentType.APPLICATION_JSON;
		if (!requestHeaders.has("Content-Type")) {
			requestHeaders.set("Content-Type", content);
		}

		preConfigHeaders.forEach((value, key) => {
			if (!requestHeaders.has(key)) {
				requestHeaders.set(key, value);
			}
		});

		if (BODYLESS.has(config.method.toLowerCase())) {
			requestHeaders.delete("Content-Type");
		}

		if (!this.#getConfig("secure", config)) {
			requestHeaders.delete("Authorization");
		}

		return {
			...config,
			type,
			headers: requestHeaders,
		};
	}

	#makeRequest<T, P>(config: HttpConfigConnection<T, P>) {
		// Strips library-only options so the rest can pass through to RequestInit.
		const {
			body: B,
			params: PA,
			type: C,
			log: L,
			arrayBuffer: AB,
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
		const { body, headers } = parseBody(config);
		const bodyless = BODYLESS.has(method.toLowerCase());

		const request: HttpRequestInit = {
			method,
			headers,
			...options,
			...(bodyless ? {} : { body }),
			...(signal ? { signal } : {}),
		};

		const url = buildUrl({
			baseUrl: this.#api,
			endpoint,
			params: { ...this.#params, ...(config.params as Record<string, unknown> | undefined) },
			serializer: config.paramsSerializer ?? this.#paramsSerializer,
		});

		return { url, config: request };
	}

	#getConfig(key: keyof HttpGlobalConfig, config: Partial<HttpConfigConnection<unknown, unknown>>) {
		return config[key] ?? this.#config[key];
	}

	/** Registers a hook and returns a function that removes it again. */
	public hook = <N extends HttpHookName>(name: N, handler: NonNullable<HttpHooks[N]>[number]): (() => void) => {
		const handlers = this.#hooks[name] as unknown[];

		handlers.push(handler);

		return () => {
			const index = handlers.indexOf(handler);

			if (index >= 0) {
				handlers.splice(index, 1);
			}
		};
	};

	/**
	 * Public primitive. The proxied http methods delegate here, and this is the
	 * only place that talks to the transport core.
	 */
	public request = async <T, R, P = undefined>(input: HttpConfigInput<T, P>): Promise<ApplyShape<K, R>> => {
		const config: HttpConfigConnection<T, P> = {
			...input,
			secure: input.secure ?? this.#config.secure ?? true,
			headers: input.headers ?? new Headers(),
		};

		const signal = composeSignal(config.signal, this.#getConfig("timeout", config) as number | undefined);

		if (signal) {
			config.signal = signal;
		}

		let context: HttpHookContext = {
			url: config.endpoint,
			init: { method: config.method, headers: config.headers },
		};

		try {
			const prepared = this.#makeRequest(this.#makeHeaders(config));

			context = { url: prepared.url, init: prepared.config };

			const response = await execute<R, K>({
				url: prepared.url,
				init: prepared.config,
				preset: this.#preset,
				fetch: this.#fetch,
				thrower: config.thrower,
				clone: config.clone,
				arrayBuffer: config.arrayBuffer,
				responseType: config.responseType,
				schema: config.schema,
				retry: this.#getConfig("retry", config) as HttpConfigConnection<T, P>["retry"],
				onDownloadProgress: config.onDownloadProgress,
				errorMessage: this.#getConfig("errorMessage", config) as string | undefined,
				log: this.#getConfig("log", config) as boolean | undefined,
				hooks: this.#hooks,
				logger: this.#logger,
				onContext: (resolved) => {
					context = resolved;
				},
			});

			return response;
		} catch (error) {
			const normalized = normalizeError(error);

			if (this.#getConfig("log", config)) {
				this.#logger.error?.({ ...context, error: normalized });
			}

			throw await runErrorHooks(this.#hooks.error, normalized, context);
		}
	};
}

/** What `Http.create()` hands back: the instance plus its proxied http methods. */
export type HttpClient<K extends ShapeName = "envelope"> = HttpInstance<K> &
	HttpMethods<K> & { safe: HttpSafeMethods<K> };
