/**
 * Shape registry. Each key names a response shape a preset can build.
 *
 * Consumers add their own shapes through declaration merging:
 *
 * declare module "@tuentyfaiv/http" {
 *   interface HttpShapes<T> {
 *     acme: { ok: boolean; result: T; traceId: string };
 *   }
 * }
 */
export interface HttpShapes<T> {
	envelope: {
		success: boolean;
		message: string;
		payload: T;
		response: Response;
	};
	bare: T;
	rest: {
		data: T;
		status: number;
		headers: Headers;
		response: Response;
	};
}

export type ShapeName = keyof HttpShapes<unknown>;

export type ApplyShape<K extends ShapeName, T> = HttpShapes<T>[K];

export type ResponseKind = "json" | "file" | "text" | "empty" | "stream" | "unknown";

/** Forces how the body is read. `auto` infers it from status and Content-Type. */
export type HttpResponseType = "auto" | "json" | "text" | "blob" | "arrayBuffer" | "stream" | "none";

export type HttpParamsSerializer = (params: Record<string, unknown>) => string;

export interface HttpErrorInit {
	statusText: string;
	message: string;
	errors:
		| string[]
		| string
		| {
				description?: string;
		  };
	status: number;
	/** Populated by the core so callers can inspect what actually failed. */
	response?: Response;
	request?: {
		url: string;
		method: string;
	};
	code?: string;
}

/**
 * Everything a preset needs to decide success and build a result.
 * `body` is already read: a parsed object for json, Blob/ArrayBuffer for
 * file, string for text, undefined for unknown.
 */
export interface ResponseContext {
	response: Response;
	status: number;
	kind: ResponseKind;
	body: unknown;
	errorMessage?: string;
	/** Set when a schema validated the payload; presets use it verbatim. */
	payload?: unknown;
}

export interface HttpPreset<K extends ShapeName = ShapeName> {
	name: string;
	shape: K;
	/** Keys tried in order when pulling the payload out of an envelope. */
	unwrap?: string[];
	/** Return an error init to reject the response, or undefined to accept it. */
	validate(context: ResponseContext): HttpErrorInit | undefined;
	build<T>(context: ResponseContext): ApplyShape<K, T>;
}

export type HttpThrower = (context: { json: Record<string, unknown>; response: Response }) => void;

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;
