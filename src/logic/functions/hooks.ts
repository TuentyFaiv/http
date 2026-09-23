import type {
	HttpErrorHook,
	HttpHookContext,
	HttpHooks,
	HttpRequestHook,
	HttpResponseHook,
} from "../typing/classes/http.typing.js";

export type ResolvedHooks = Required<HttpHooks>;

export function resolveHooks(hooks?: HttpHooks): ResolvedHooks {
	return {
		request: [...(hooks?.request ?? [])],
		response: [...(hooks?.response ?? [])],
		error: [...(hooks?.error ?? [])],
	};
}

export interface RequestHookResult {
	context: HttpHookContext;
	response?: Response;
}

export async function runRequestHooks(hooks: HttpRequestHook[], context: HttpHookContext): Promise<RequestHookResult> {
	let current = context;

	for (const hook of hooks) {
		// biome-ignore lint/performance/noAwaitInLoops: hooks are a pipeline; each one sees the previous one's output
		const result = await hook(current);

		if (result instanceof Response) {
			return { context: current, response: result };
		}
		if (result) {
			current = result;
		}
	}

	return { context: current };
}

export async function runResponseHooks(
	hooks: HttpResponseHook[],
	response: Response,
	context: HttpHookContext
): Promise<Response> {
	let current = response;

	for (const hook of hooks) {
		// biome-ignore lint/performance/noAwaitInLoops: hooks are a pipeline; each one sees the previous one's output
		const result = await hook(current, context);

		if (result) {
			current = result;
		}
	}

	return current;
}

export async function runErrorHooks(hooks: HttpErrorHook[], error: Error, context: HttpHookContext): Promise<Error> {
	let current = error;

	for (const hook of hooks) {
		// biome-ignore lint/performance/noAwaitInLoops: hooks are a pipeline; each one sees the previous one's output
		const result = await hook(current, context);

		if (result) {
			current = result;
		}
	}

	return current;
}
