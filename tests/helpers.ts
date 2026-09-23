import type { HttpFetch } from "../src/index.js";

export interface Call {
	url: string;
	init?: RequestInit;
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
		...init,
	});
}

export function recorder(response: () => Response = () => jsonResponse({ data: {} })) {
	const calls: Call[] = [];
	const fetch: HttpFetch = async (url, init) => {
		calls.push({ url, init });

		return response();
	};

	return { calls, fetch };
}

export function sentHeaders(init?: RequestInit) {
	return new Headers(init?.headers);
}
