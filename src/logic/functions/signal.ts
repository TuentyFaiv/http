type SignalWithAny = typeof AbortSignal & {
	any?: (signals: AbortSignal[]) => AbortSignal;
	timeout?: (milliseconds: number) => AbortSignal;
};

/** `AbortSignal.any` where available, with a listener-based fallback. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
	const native = (AbortSignal as SignalWithAny).any;

	if (typeof native === "function") {
		return native.call(AbortSignal, signals);
	}

	const controller = new AbortController();

	for (const signal of signals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			continue;
		}

		signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
	}

	return controller.signal;
}

export function timeoutSignal(milliseconds: number): AbortSignal {
	const native = (AbortSignal as SignalWithAny).timeout;

	if (typeof native === "function") {
		return native.call(AbortSignal, milliseconds);
	}

	const controller = new AbortController();

	setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), milliseconds);

	return controller.signal;
}

/**
 * Merges a caller's signal with a timeout so either can abort the request.
 * A timeout aborts with `TimeoutError`, a caller with `AbortError`.
 */
export function composeSignal(signal?: AbortSignal, timeout?: number): AbortSignal | undefined {
	if (!timeout || timeout <= 0) {
		return signal;
	}

	const timer = timeoutSignal(timeout);

	return signal ? anySignal([signal, timer]) : timer;
}
