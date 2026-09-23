import type { DemoContext } from "./demo-request-helper";

import { exampleText, scenarios } from "../i18n/examples";
import { errorResult, requestDemo } from "./demo-request-helper";
import { downloadDemo, streamDemo, uploadDemo } from "./demo-transfer-helper";

const INDENT = 2;
const MAX_LOGS = 80;
const PERCENT = 100;
function required<T extends Element>(root: Element, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) {
		throw new Error(`Missing demo element: ${selector}`);
	}
	return element;
}
function display(value: unknown): string {
	return (
		JSON.stringify(
			value,
			(_key, item: unknown) => {
				if (item instanceof Response) {
					return { status: item.status, url: item.url, headers: Object.fromEntries(item.headers) };
				}
				if (item instanceof Headers) {
					return Object.fromEntries(item);
				}
				return item;
			},
			INDENT
		) ?? "null"
	);
}
function mount(root: HTMLElement) {
	if (root.dataset.mounted) {
		return;
	}
	root.dataset.mounted = "true";
	const text = exampleText(root.lang);
	const form = required<HTMLFormElement>(root, "form");
	const fields = required<HTMLFieldSetElement>(root, "fieldset");
	const scenarioSelect = required<HTMLSelectElement>(root, "[data-scenario]");
	const run = required<HTMLButtonElement>(root, "[data-run]");
	const cancel = required<HTMLButtonElement>(root, "[data-cancel]");
	const state = required<HTMLElement>(root, "[data-state]");
	const result = required<HTMLElement>(root, "[data-result]");
	const log = required<HTMLElement>(root, "[data-log]");
	const progressArea = required<HTMLElement>(root, "[data-progress-area]");
	const progress = required<HTMLProgressElement>(root, "progress");
	const progressText = required<HTMLElement>(root, "[data-progress-text]");
	let active: AbortController | undefined;
	const updateFields = () => {
		for (const label of root.querySelectorAll<HTMLElement>("[data-for]")) {
			const visible = label.dataset.for?.split(" ").includes(scenarioSelect.value) ?? false;
			label.hidden = !visible;
			for (const input of label.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
				"input, select, textarea"
			)) {
				input.disabled = !visible;
			}
		}
		const transfer = ["upload", "download", "stream"].includes(scenarioSelect.value);
		required<HTMLElement>(root, '[data-source="request"]').hidden = transfer;
		required<HTMLElement>(root, '[data-source="transfer"]').hidden = !transfer;
	};
	const stop = () => {
		active?.abort();
	};
	const reset = () => {
		fields.disabled = false;
		run.disabled = false;
		cancel.disabled = true;
		progressArea.hidden = true;
	};
	const showProgress = (loaded: number, total?: number) => {
		progressArea.hidden = false;
		progress.setAttribute("aria-label", text.progress);
		if (total !== undefined && total > 0) {
			progress.max = total;
			progress.value = loaded;
			progressText.textContent = `${loaded} / ${total} ${text.bytes} (${Math.round((loaded / total) * PERCENT)}%)`;
		} else {
			progress.removeAttribute("value");
			progressText.textContent = `${loaded} ${text.bytes} · ${text.unknown}`;
		}
	};
	const showFailure = (error: unknown, controller: AbortController) => {
		if (active !== controller) {
			return;
		}
		state.textContent = controller.signal.aborted ? text.cancelled : text.failed;
		if (!controller.signal.aborted) {
			result.textContent = display(errorResult(error, text));
		}
	};
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (active) {
			return;
		}
		const scenario = scenarios.find((value) => value === scenarioSelect.value);
		if (!scenario) {
			return;
		}
		const controller = new AbortController();
		active = controller;
		const current = () => active === controller && !controller.signal.aborted;
		const entries: string[] = [];
		const context: DemoContext = {
			base: new URL(`${import.meta.env.BASE_URL}api/examples/`, globalThis.location.origin).href,
			signal: controller.signal,
			form: new FormData(form),
			text,
			log(message) {
				if (current()) {
					entries.push(message);
					log.textContent = entries.slice(-MAX_LOGS).join("\n");
				}
			},
			result(value) {
				if (current()) {
					result.textContent = display(value);
				}
			},
			progress(loaded, total) {
				if (current()) {
					showProgress(loaded, total);
				}
			},
		};
		fields.disabled = true;
		run.disabled = true;
		cancel.disabled = false;
		state.textContent = text.running;
		result.textContent = text.empty;
		log.textContent = text.noEvents;
		progress.removeAttribute("value");
		progressArea.hidden = false;
		progress.setAttribute("aria-label", text.running);
		progressText.textContent = scenario === "upload" ? text.uploading : text.running;
		context.log(`${text.scenario}: ${text[scenario]}`);
		try {
			const value = await executeDemo(scenario, context);
			controller.signal.throwIfAborted();
			if (current()) {
				context.result(value);
				context.log(text.complete);
				state.textContent = text.complete;
			}
		} catch (error) {
			showFailure(error, controller);
		} finally {
			if (active === controller) {
				active = undefined;
				reset();
			}
		}
	});
	scenarioSelect.addEventListener("change", updateFields);
	cancel.addEventListener("click", stop);
	const leave = () => {
		stop();
		active = undefined;
		reset();
		state.textContent = text.cancelled;
	};
	globalThis.addEventListener("pagehide", leave);
	document.addEventListener(
		"astro:before-swap",
		() => {
			leave();
			globalThis.removeEventListener("pagehide", leave);
		},
		{ once: true }
	);
	updateFields();
	reset();
}
async function executeDemo(scenario: (typeof scenarios)[number], context: DemoContext) {
	switch (scenario) {
		case "upload":
			return await uploadDemo(context);
		case "download":
			return await downloadDemo(context);
		case "stream":
			return await streamDemo(context);
		default:
			return await requestDemo(scenario, context);
	}
}
function initialize() {
	for (const root of document.querySelectorAll<HTMLElement>("[data-live-examples]")) {
		mount(root);
	}
}
initialize();
document.addEventListener("astro:page-load", initialize);
