/// <reference types="astro/client" />

import type { DemoContext } from "./demo-request-helper.js";

import { exampleText, scenarios } from "../i18n/examples.js";
import { errorResult, requestDemo } from "./demo-request-helper.js";
import { confirmedUploadDemo, downloadDemo, multipartDemo, streamDemo, uploadDemo } from "./demo-transfer-helper.js";

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
	const scenario = scenarios.find((value) => value === root.dataset.scenario);
	if (!scenario) {
		throw new Error("Unknown example");
	}
	const run = required<HTMLButtonElement>(root, "[data-run]");
	const cancel = required<HTMLButtonElement>(root, "[data-cancel]");
	const save = required<HTMLButtonElement>(root, "[data-save]");
	const state = required<HTMLElement>(root, "[data-state]");
	const output = required<HTMLElement>(root, ".live-output");
	const result = required<HTMLElement>(root, "[data-result]");
	const log = required<HTMLElement>(root, "[data-log]");
	const progressArea = required<HTMLElement>(root, "[data-progress-area]");
	const progress = required<HTMLProgressElement>(root, "progress");
	const progressText = required<HTMLElement>(root, "[data-progress-text]");
	let active: AbortController | undefined;
	let savedBlob: Blob | undefined;
	let downloadUrl: string | undefined;
	let progressComplete = false;
	const clearDownload = () => {
		savedBlob = undefined;
		save.hidden = true;
		if (downloadUrl) {
			URL.revokeObjectURL(downloadUrl);
			downloadUrl = undefined;
		}
	};
	// Keep one URL for the available blob; revoking immediately after click can race the browser's download.
	save.addEventListener("click", () => {
		if (!savedBlob) {
			return;
		}
		downloadUrl ??= URL.createObjectURL(savedBlob);
		const anchor = document.createElement("a");
		anchor.href = downloadUrl;
		anchor.download = "demo.bin";
		anchor.click();
	});
	const method = form.elements.namedItem("method") as HTMLSelectElement | null;
	const updateMethod = () => {
		if (!method) {
			return;
		}
		const post = method.value === "POST";
		const name = required<HTMLElement>(root, "[data-json-name]");
		const body = required<HTMLElement>(root, "[data-json-body]");
		name.hidden = post;
		required<HTMLInputElement>(name, "input").disabled = post;
		body.hidden = !post;
		required<HTMLTextAreaElement>(body, "textarea").disabled = !post;
	};
	const stop = () => {
		active?.abort();
		progressComplete = false;
		clearDownload();
	};
	const reset = () => {
		const restoreRunFocus = document.activeElement === cancel;
		fields.disabled = false;
		run.disabled = false;
		run.setAttribute("aria-disabled", "false");
		form.setAttribute("aria-busy", "false");
		output.setAttribute("aria-busy", "false");
		cancel.disabled = true;
		if (restoreRunFocus) {
			run.focus({ preventScroll: true });
		}
		progressArea.hidden = !(savedBlob || (scenario === "confirmedUpload" && progressComplete));
		// Keep final byte counts visible without leaving a completed download's unknown-total bar animating.
		progress.hidden = savedBlob !== undefined && !progress.hasAttribute("value");
	};
	const showProgress = (loaded: number, total?: number, done = false) => {
		progressArea.hidden = false;
		progress.setAttribute("aria-label", scenario === "confirmedUpload" ? text.confirmedProgress : text.progress);
		if (total === undefined) {
			progress.removeAttribute("value");
			progressText.textContent = `${loaded} ${text.bytes} · ${text.unknown}`;
			return;
		}
		progress.max = total || 1;
		progress.value = total === 0 ? Number(done) : loaded;
		const percent = Math.min(done ? PERCENT : PERCENT - 1, Math.round((progress.value / progress.max) * PERCENT));
		progressText.textContent = `${loaded} / ${total} ${text.bytes} (${percent}%)`;
	};
	const showFailure = (error: unknown, controller: AbortController) => {
		if (active !== controller) {
			return;
		}
		progressComplete = false;
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
		const controller = new AbortController();
		clearDownload();
		progressComplete = false;
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
			progress(loaded, total, done) {
				if (current()) {
					progressComplete = done === true;
					showProgress(loaded, total, done);
				}
			},
			download(blob) {
				if (current()) {
					savedBlob = blob;
					save.hidden = false;
				}
			},
		};
		fields.disabled = true;
		// Keep keyboard focus on Run; the active controller above guards repeat submissions.
		run.setAttribute("aria-disabled", "true");
		form.setAttribute("aria-busy", "true");
		output.setAttribute("aria-busy", "true");
		cancel.disabled = false;
		state.textContent = text.running;
		result.textContent = text.empty;
		log.textContent = text.noEvents;
		progress.removeAttribute("value");
		progress.hidden = false;
		progressArea.hidden = !["upload", "multipart", "download", "confirmedUpload"].includes(scenario);
		progress.setAttribute("aria-label", text.running);
		progressText.textContent = scenario === "upload" || scenario === "multipart" ? text.uploading : text.running;
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
	method?.addEventListener("change", updateMethod);
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
	updateMethod();
	reset();
}
async function executeDemo(scenario: (typeof scenarios)[number], context: DemoContext) {
	switch (scenario) {
		case "confirmedUpload":
			return await confirmedUploadDemo(context);
		case "multipart":
			return await multipartDemo(context);
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
