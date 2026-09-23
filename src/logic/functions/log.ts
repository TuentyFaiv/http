// biome-ignore-all lint/suspicious/noConsole: this file *is* the console logger; callers opt in via `log`
import type { HttpLogger } from "../typing/classes/http.typing.js";

const STYLE = "color: #00b894; font-weight: bold;";

const SENSITIVE = new Set([
	"authorization",
	"proxy-authorization",
	"cookie",
	"set-cookie",
	"x-api-key",
	"x-auth-token",
]);

export function redactHeaders(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [key, value] of headers.entries()) {
		result[key] = SENSITIVE.has(key.toLowerCase()) ? "[redacted]" : value;
	}

	return result;
}

export const consoleLogger: HttpLogger = {
	request({ url, init }) {
		console.log("%cREQUEST:", STYLE, {
			url,
			method: init.method,
			headers: redactHeaders(init.headers),
			body: init.body,
		});
	},

	response({ url, response, body, duration }) {
		console.log("%cRESPONSE:", STYLE, {
			url,
			status: response.status,
			duration: `${duration}ms`,
			headers: redactHeaders(response.headers),
			body,
		});
	},

	error({ url, error }) {
		console.error("%cERROR:", STYLE, { url, error });
	},
};
