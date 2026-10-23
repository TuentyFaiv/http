import { readFile } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exampleText } from "../docs/src/i18n/examples.js";
import { errorResult, requestDemo } from "../docs/src/scripts/demo-request-helper.js";

vi.mock("../docs/src/scripts/demo-request-helper", () => ({
	errorResult: vi.fn(() => ({ error: "Network unavailable" })),
	requestDemo: vi.fn(),
}));
vi.mock("../docs/src/scripts/demo-transfer-helper", () => ({
	confirmedUploadDemo: vi.fn(),
	downloadDemo: vi.fn(),
	multipartDemo: vi.fn(),
	streamDemo: vi.fn(),
	uploadDemo: vi.fn(),
}));

// Exercise the UI controller without a DOM dependency or any transport requests.
class DemoElement extends EventTarget {
	attributes = new Map<string, string>();
	children = new Map<string, DemoElement>();
	dataset: Record<string, string> = {};
	disabled = false;
	hidden = false;
	lang = "en-US";
	textContent = "";
	elements = { namedItem: () => null };
	focus = vi.fn((_options?: FocusOptions) => {});
	querySelector(selector: string) {
		return this.children.get(selector) ?? null;
	}
	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}
	hasAttribute(name: string) {
		return this.attributes.has(name);
	}
	getAttribute(name: string) {
		return this.attributes.get(name) ?? null;
	}
	removeAttribute(name: string) {
		this.attributes.delete(name);
	}
}

function deferred() {
	let resolve!: (value: unknown) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<unknown>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

async function mount(locale = "en-US") {
	const root = new DemoElement();
	root.lang = locale;
	root.dataset.scenario = "timing";
	const selectors = {
		form: "form",
		fields: "fieldset",
		run: "[data-run]",
		cancel: "[data-cancel]",
		save: "[data-save]",
		state: "[data-state]",
		output: ".live-output",
		result: "[data-result]",
		log: "[data-log]",
		progressArea: "[data-progress-area]",
		progress: "progress",
		progressText: "[data-progress-text]",
	};
	const elements = Object.fromEntries(
		Object.entries(selectors).map(([key, selector]) => {
			const element = new DemoElement();
			root.children.set(selector, element);
			return [key, element];
		})
	) as Record<keyof typeof selectors, DemoElement>;
	const text = exampleText(locale);
	elements.run.disabled = true;
	elements.run.textContent = text.run;
	elements.cancel.disabled = true;
	elements.state.textContent = text.idle;
	const document = Object.assign(new EventTarget(), {
		activeElement: null as DemoElement | null,
		querySelectorAll: () => [root],
	});
	const window = new EventTarget();
	elements.run.focus.mockImplementation(() => {
		document.activeElement = elements.run;
	});
	const NativeFormData = globalThis.FormData;
	const snapshots: { form: DemoElement; fieldsDisabled: boolean }[] = [];
	vi.stubGlobal(
		"FormData",
		vi.fn(function snapshot(form: DemoElement) {
			snapshots.push({ form, fieldsDisabled: elements.fields.disabled });
			const data = new NativeFormData();
			data.set("delay", "1000");
			data.set("deadline", "500");
			return data;
		})
	);
	vi.stubGlobal("document", document);
	vi.stubGlobal("location", { origin: "https://docs.example.test" });
	vi.stubGlobal("addEventListener", window.addEventListener.bind(window));
	vi.stubGlobal("removeEventListener", window.removeEventListener.bind(window));
	vi.stubEnv("BASE_URL", "/");
	const pending = deferred();
	vi.mocked(requestDemo).mockReturnValue(pending.promise);
	await import("../docs/src/scripts/live-examples.js");
	const submit = () => elements.form.dispatchEvent(new Event("submit", { cancelable: true }));
	return { root, elements, document, window, text, pending, submit, snapshots };
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("live example busy and focus lifecycle", () => {
	it.each(["en-US", "es-MX"])(
		"keeps %s requests opt-in and Run focused throughout a real pending state",
		async (locale) => {
			const { root, elements, document, text, pending, submit, snapshots } = await mount(locale);
			expect(requestDemo).not.toHaveBeenCalled();
			expect(elements.state.textContent).toBe(text.idle);
			expect(elements.run.disabled).toBe(false);
			expect(elements.cancel.disabled).toBe(true);
			elements.run.focus();
			elements.run.focus.mockClear();
			submit();
			expect(requestDemo).toHaveBeenCalledOnce();
			expect(requestDemo).toHaveBeenCalledWith("timing", expect.objectContaining({ text }));
			expect(snapshots).toEqual([{ form: elements.form, fieldsDisabled: false }]);
			expect(vi.mocked(requestDemo).mock.calls[0]?.[1].form.get("deadline")).toBe("500");
			expect(elements.run.disabled).toBe(false);
			expect(elements.run.getAttribute("aria-disabled")).toBe("true");
			expect(document.activeElement).toBe(elements.run);
			expect(elements.run.textContent).toBe(text.run);
			expect(elements.form.getAttribute("aria-busy")).toBe("true");
			expect(elements.output.getAttribute("aria-busy")).toBe("true");
			expect(root.hasAttribute("aria-busy")).toBe(false);
			expect(elements.state.hasAttribute("aria-busy")).toBe(false);
			expect(elements.state.textContent).toBe(text.running);
			expect(elements.fields.disabled).toBe(true);
			expect(elements.cancel.disabled).toBe(false);
			expect(elements.result.textContent).toBe(text.empty);
			submit();
			expect(requestDemo).toHaveBeenCalledOnce();
			pending.resolve({ payload: { name: "Ada" } });
			await vi.waitFor(() => expect(elements.form.getAttribute("aria-busy")).toBe("false"));
			expect(elements.output.getAttribute("aria-busy")).toBe("false");
			expect(elements.run.getAttribute("aria-disabled")).toBe("false");
			expect(elements.state.textContent).toBe(text.complete);
			expect(JSON.parse(elements.result.textContent)).toEqual({ payload: { name: "Ada" } });
			expect(elements.fields.disabled).toBe(false);
			expect(elements.cancel.disabled).toBe(true);
			expect(document.activeElement).toBe(elements.run);
			expect(elements.run.focus).not.toHaveBeenCalled();
		}
	);

	it.each(["en-US", "es-MX"])(
		"cancels in %s without success and restores focused Cancel to Run without scrolling",
		async (locale) => {
			const { elements, document, text, pending, submit } = await mount(locale);
			submit();
			const context = vi.mocked(requestDemo).mock.calls[0]?.[1];
			document.activeElement = elements.cancel;
			elements.cancel.dispatchEvent(new Event("click"));
			expect(context?.signal.aborted).toBe(true);
			pending.reject(context?.signal.reason);
			await vi.waitFor(() => expect(elements.cancel.disabled).toBe(true));
			expect(elements.state.textContent).toBe(text.cancelled);
			expect(elements.result.textContent).toBe(text.empty);
			expect(elements.log.textContent).not.toContain(text.complete);
			expect(errorResult).not.toHaveBeenCalled();
			expect(elements.run.getAttribute("aria-disabled")).toBe("false");
			expect(elements.form.getAttribute("aria-busy")).toBe("false");
			expect(elements.output.getAttribute("aria-busy")).toBe("false");
			expect(elements.run.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
			expect(document.activeElement).toBe(elements.run);
		}
	);

	it("restores focused Cancel after successful completion too", async () => {
		const { elements, document, pending, submit } = await mount();
		submit();
		document.activeElement = elements.cancel;
		pending.resolve({ payload: "response" });
		await vi.waitFor(() => expect(elements.cancel.disabled).toBe(true));
		expect(elements.run.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
		expect(document.activeElement).toBe(elements.run);
	});

	it("reports actual failures and does not steal focus from the output", async () => {
		const { elements, document, text, pending, submit } = await mount();
		submit();
		document.activeElement = elements.result;
		const error = new Error("Network unavailable");
		pending.reject(error);
		await vi.waitFor(() => expect(elements.form.getAttribute("aria-busy")).toBe("false"));
		expect(errorResult).toHaveBeenCalledExactlyOnceWith(error, text);
		expect(elements.state.textContent).toBe(text.failed);
		expect(JSON.parse(elements.result.textContent)).toEqual({ error: "Network unavailable" });
		expect(elements.run.getAttribute("aria-disabled")).toBe("false");
		expect(elements.output.getAttribute("aria-busy")).toBe("false");
		expect(document.activeElement).toBe(elements.result);
		expect(elements.run.focus).not.toHaveBeenCalled();
	});

	it.each(["pagehide", "astro:before-swap"])("clears busy state on %s and ignores stale completion", async (event) => {
		const { elements, document, window, text, pending, submit } = await mount();
		submit();
		const context = vi.mocked(requestDemo).mock.calls[0]?.[1];
		const target = event === "pagehide" ? window : document;
		target.dispatchEvent(new Event(event));
		expect(context?.signal.aborted).toBe(true);
		expect(elements.form.getAttribute("aria-busy")).toBe("false");
		expect(elements.output.getAttribute("aria-busy")).toBe("false");
		expect(elements.run.getAttribute("aria-disabled")).toBe("false");
		expect(elements.fields.disabled).toBe(false);
		pending.resolve({ stale: true });
		await pending.promise;
		await Promise.resolve();
		expect(elements.state.textContent).toBe(text.cancelled);
		expect(elements.result.textContent).toBe(text.empty);
	});

	it("does not remount or submit automatically on Astro navigation", async () => {
		const { document, pending, submit } = await mount();
		document.dispatchEvent(new Event("astro:page-load"));
		expect(requestDemo).not.toHaveBeenCalled();
		submit();
		expect(requestDemo).toHaveBeenCalledOnce();
		pending.resolve({ payload: "response" });
		await pending.promise;
	});

	it("renders the localized disclosure before Run and uses one shared hand icon family", async () => {
		const source = await readFile(new URL("../docs/src/components/live-examples.astro", import.meta.url), "utf8");
		expect(source.indexOf("{t.privacy}")).toBeLessThan(source.indexOf("data-run disabled"));
		expect(source).toContain('name="hourglass" size={ICON_SIZE}');
		expect(source).toContain('<summary><PenIcon name="chevron-down"');
		expect(source).toContain('data-state role="status" aria-live="polite"');
	});
});
