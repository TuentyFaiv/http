import type { HttpErrorInit } from "../typing/classes/preset.typing.js";

/** V8 only; absent on Safari and Firefox. */
type ErrorWithCapture = ErrorConstructor & {
	captureStackTrace?: (target: object, ctor?: new (...args: never[]) => unknown) => void;
};

function captureStack(target: object, ctor: new (...args: never[]) => unknown): void {
	(Error as ErrorWithCapture).captureStackTrace?.(target, ctor);
}

export class CustomError extends Error {
	date: Date;

	constructor(name = "Error", message?: string, options?: ErrorOptions) {
		super(message, options);

		captureStack(this, CustomError);

		this.name = name;
		this.date = new Date();
	}
}

export class ServiceError extends Error {
	date: Date;
	status: number;
	statusText: string;
	errors: HttpErrorInit["errors"];
	code?: string;
	response?: Response;
	request?: HttpErrorInit["request"];

	constructor(data: HttpErrorInit, options?: ErrorOptions) {
		super(data.message ?? "", options);

		captureStack(this, ServiceError);

		this.name = "ServiceError";
		this.date = new Date();
		this.status = data.status;
		this.statusText = data.statusText;
		this.errors = data.errors;
		this.code = data.code;
		this.response = data.response;
		this.request = data.request;
	}

	/** Serializes named failure details, including the non-enumerable Error.message. */
	// biome-ignore lint/style/useNamingConvention: `toJSON` is the name JSON.stringify looks for
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			status: this.status,
			statusText: this.statusText,
			errors: this.errors,
			code: this.code,
			date: this.date,
			request: this.request,
		};
	}
}
