import { instance } from "./logic/functions/instance.js";

export type { ServiceErrorData } from "./logic/classes/errors.js";
export type { HttpClient } from "./logic/classes/http.js";
export type { HttpRetry, HttpRetryOptions } from "./logic/functions/retry.js";
export type { ConventionMatcher } from "./logic/presets/conventions.js";
export type {
	CreatePresetOptions,
	HttpPresetDefinition,
	Unwrap,
} from "./logic/presets/create.js";
export type {
	HttpConfigInitial,
	HttpConfigInput,
	HttpConnectionError,
	HttpConnectionReturn,
	HttpErrorHook,
	HttpHookContext,
	HttpHookName,
	HttpHooks,
	HttpLogger,
	HttpMethods,
	HttpProgress,
	HttpProgressHandler,
	HttpRequestHook,
	HttpRequestInit,
	HttpResponseHook,
	HttpSafeMethods,
	HttpSafeResult,
	HttpStorage,
	HttpStorageAsync,
} from "./logic/typing/classes/http.typing.js";
export type {
	ApplyShape,
	HttpErrorInit,
	HttpFetch,
	HttpParamsSerializer,
	HttpPreset,
	HttpResponseType,
	HttpShapes,
	HttpThrower,
	ResponseContext,
	ResponseKind,
	ShapeName,
} from "./logic/typing/classes/preset.typing.js";
export type {
	InferSchemaOutput,
	StandardSchemaV1,
	StandardSchemaV1Issue,
	StandardSchemaV1Result,
} from "./logic/typing/classes/schema.typing.js";
export type { ContentTypes } from "./logic/typing/enums/content.js";
export type { HttpMethods as HttpMethodNames } from "./logic/typing/enums/methods.js";

export { CustomError, ServiceError } from "./logic/classes/errors.js";
export { HttpInstance as Http } from "./logic/classes/http.js";
export { consoleLogger, redactHeaders } from "./logic/functions/log.js";
export { withProgress } from "./logic/functions/progress.js";
export { execute, presetThrower } from "./logic/functions/request.js";
export { resolveRetry, retryAfter } from "./logic/functions/retry.js";
export { issuesToErrors, validateSchema } from "./logic/functions/schema.js";
export { anySignal, composeSignal, timeoutSignal } from "./logic/functions/signal.js";
export { normalizeError, throwError } from "./logic/functions/throw.js";
export { buildUrl, serializeParams } from "./logic/functions/url.js";
export { bare } from "./logic/presets/bare.js";
export {
	detailField,
	errorField,
	errorsField,
	payloadField,
	problemDetails,
	statusFallback,
	toErrorInit,
} from "./logic/presets/conventions.js";
export { createPreset, unwrapKeys } from "./logic/presets/create.js";
export { envelope } from "./logic/presets/envelope.js";
export { problem } from "./logic/presets/problem.js";
export { rest } from "./logic/presets/rest.js";
export { ContentType } from "./logic/typing/enums/content.js";
export { HttpMethod } from "./logic/typing/enums/methods.js";

export default instance;
