import type { HttpMethods } from "../typing/enums/methods.js";

import { HttpMethod } from "../typing/enums/methods.js";

const IDEMPOTENT: HttpMethods[] = [
	HttpMethod.GET,
	HttpMethod.HEAD,
	HttpMethod.PUT,
	HttpMethod.DELETE,
	HttpMethod.OPTIONS,
];

const STATUS_REQUEST_TIMEOUT = 408;
const STATUS_TOO_MANY_REQUESTS = 429;
const STATUS_SERVER_ERROR = 500;
const STATUS_BAD_GATEWAY = 502;
const STATUS_UNAVAILABLE = 503;
const STATUS_GATEWAY_TIMEOUT = 504;

const RETRYABLE = [
	STATUS_REQUEST_TIMEOUT,
	STATUS_TOO_MANY_REQUESTS,
	STATUS_SERVER_ERROR,
	STATUS_BAD_GATEWAY,
	STATUS_UNAVAILABLE,
	STATUS_GATEWAY_TIMEOUT,
];

const BACKOFF_FACTOR = 2;
const BACKOFF_BASE_MS = 300;
const BACKOFF_CEILING_MS = 10_000;
const JITTER_MS = 100;
const SECOND_MS = 1000;

export interface HttpRetryOptions {
	/** Retries *after* the first send, so `2` means up to three requests. */
	attempts: number;
	/** Milliseconds, or a function of the zero-based attempt number. */
	delay?: number | ((attempt: number, response?: Response) => number);
	/** Defaults to the idempotent methods; POST and PATCH are excluded. */
	methods?: HttpMethods[];
	statusCodes?: number[];
	/** Honour a `Retry-After` header over the computed delay. Defaults to true. */
	respectRetryAfter?: boolean;
}

export type HttpRetry = number | HttpRetryOptions;

export interface ResolvedRetry extends Required<Omit<HttpRetryOptions, "delay">> {
	/** Undefined means "unset", which falls back to exponential backoff. */
	delay: (attempt: number, response?: Response) => number | undefined;
}

function backoff(attempt: number): number {
	const base = Math.min(BACKOFF_FACTOR ** attempt * BACKOFF_BASE_MS, BACKOFF_CEILING_MS);

	return base + Math.floor(Math.random() * JITTER_MS);
}

export function resolveRetry(retry?: HttpRetry): ResolvedRetry | undefined {
	if (!retry) {
		return undefined;
	}

	const options = typeof retry === "number" ? { attempts: retry } : retry;

	if (options.attempts <= 0) {
		return undefined;
	}

	const { delay } = options;

	return {
		attempts: options.attempts,
		methods: options.methods ?? IDEMPOTENT,
		statusCodes: options.statusCodes ?? RETRYABLE,
		respectRetryAfter: options.respectRetryAfter ?? true,
		delay: typeof delay === "function" ? delay : () => delay,
	};
}

/** `Retry-After` is either seconds or an http date. */
export function retryAfter(response?: Response): number | undefined {
	const header = response?.headers.get("Retry-After");

	if (!header) {
		return undefined;
	}

	const seconds = Number(header);

	if (!Number.isNaN(seconds)) {
		return Math.max(0, seconds * SECOND_MS);
	}

	const date = Date.parse(header);

	return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function canRetry(options: ResolvedRetry, attempt: number, method: string): boolean {
	return attempt < options.attempts && options.methods.includes(method.toUpperCase() as HttpMethods);
}

export function shouldRetryResponse(options: ResolvedRetry, response: Response): boolean {
	return options.statusCodes.includes(response.status);
}

export function delayFor(options: ResolvedRetry, attempt: number, response?: Response): number {
	if (options.respectRetryAfter) {
		const header = retryAfter(response);

		if (header !== undefined) {
			return header;
		}
	}

	return options.delay(attempt, response) ?? backoff(attempt);
}

export function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}
