import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type CodeTheme = {
	type: string;
	colors: Record<string, string>;
	tokenColors: { settings: { foreground: string } }[];
};
const { codeThemes }: { codeThemes: CodeTheme[] } = await import(
	new URL("../docs/src/code-themes.mjs", import.meta.url).href
);
const css = await readFile(new URL("../docs/src/styles/custom.css", import.meta.url), "utf8");
const channelsPerColor = 3;
const hexBase = 16;
const maxChannel = 255;
const linearThreshold = 0.040_45;
const linearDivisor = 12.92;
const transferOffset = 0.055;
const transferScale = 1.055;
const transferPower = 2.4;
const luminanceOffset = 0.05;
const pathPattern = /<path[\s\S]*?\sd="([^"]+)"/;
const aaaTextContrast = 7;
const uiContrast = 3;

function required<T>(value: T | undefined, label: string): T {
	if (value === undefined) {
		throw new Error(`Missing ${label}`);
	}
	return value;
}

function luminance(color: string) {
	const channels = color.startsWith("#")
		? color
				.slice(1)
				.match(/../g)
				?.map((channel) => Number.parseInt(channel, hexBase))
		: color.match(/[\d.]+/g)?.map(Number);
	if (channels?.length !== channelsPerColor) {
		throw new Error(`Unsupported color: ${color}`);
	}
	const [red, green, blue] = channels.map((channel) => {
		const value = channel / maxChannel;
		return value <= linearThreshold
			? value / linearDivisor
			: ((value + transferOffset) / transferScale) ** transferPower;
	});
	const [redWeight, greenWeight, blueWeight] = [0.2126, 0.7152, 0.0722];
	return red * redWeight + green * greenWeight + blue * blueWeight;
}
function contrast(foreground: string, background: string) {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (lighter + luminanceOffset) / (darker + luminanceOffset);
}
function tokens(theme: string) {
	const selector = theme === "light" ? ':root[data-theme="light"]' : ":root";
	const [section] = css.slice(css.indexOf(selector)).split("}");
	return Object.fromEntries(
		[...section.matchAll(/--fz-([\w-]+):\s*(rgb\([^)]+\))/g)].map((match) => [match[1], match[2]])
	);
}

describe("approved documentation palette", () => {
	it.each(["light", "dark"])("keeps %s reading text, syntax, and action states above 7:1", (mode) => {
		const palette = tokens(mode);
		const color = (name: string) => required(palette[name], `${mode}: ${name} color`);
		for (const foreground of ["ink", "muted", "violet", "code-saffron", "code-teal"]) {
			for (const background of ["page", "code-bg"]) {
				expect(
					contrast(color(foreground), color(background)),
					`${mode}: ${foreground} / ${background}`
				).toBeGreaterThanOrEqual(aaaTextContrast);
			}
		}
		expect(contrast(color("saffron"), color("page"))).toBeGreaterThanOrEqual(aaaTextContrast);
		for (const state of ["violet", "violet-hover", "violet-pressed"]) {
			expect(contrast(color("page"), color(state)), `${mode}: primary ${state}`).toBeGreaterThanOrEqual(
				aaaTextContrast
			);
		}
		for (const surface of ["page", "code-bg"]) {
			expect(contrast(color("border"), color(surface)), `${mode}: border ${surface}`).toBeGreaterThanOrEqual(
				uiContrast
			);
		}
		const codeTheme = required(
			codeThemes.find((theme) => theme.type === mode),
			`${mode} code theme`
		);
		const codeBackground = required(codeTheme.colors["editor.background"], `${mode} editor background`);
		expect(codeBackground.toLowerCase()).toBe(mode === "light" ? "#eaeaf4" : "#0a0c15");
		for (const token of codeTheme.tokenColors) {
			expect(contrast(token.settings.foreground, codeBackground)).toBeGreaterThanOrEqual(aaaTextContrast);
		}
	});

	it("keeps the favicon contour identical to the approved Open f component", async () => {
		const source = await readFile(new URL("../docs/src/components/brand-mark.astro", import.meta.url), "utf8");
		const favicon = await readFile(new URL("../docs/public/favicon.svg", import.meta.url), "utf8");
		const path = source.match(pathPattern)?.[1];
		expect(path).toBeTruthy();
		expect(favicon).toContain(`d="${path}"`);
		expect(favicon).toContain("prefers-color-scheme: dark");
	});

	it("uses one shared hand-drawn GitHub icon in the header and footer", async () => {
		const [icons, head, footer, controls] = await Promise.all([
			readFile(new URL("../docs/src/components/pen-icon.astro", import.meta.url), "utf8"),
			readFile(new URL("../docs/src/components/starlight-head.astro", import.meta.url), "utf8"),
			readFile(new URL("../docs/src/components/site-footer.astro", import.meta.url), "utf8"),
			readFile(new URL("../docs/src/styles/starlight-controls.css", import.meta.url), "utf8"),
		]);
		expect(icons).toContain("github:");
		expect(head).toContain('slot="github" name="github"');
		expect(footer).toContain('name="github"');
		expect(controls).toContain("--fz-control-icon: var(--fz-icon-github)");
	});

	it("retains distributed font notices without a footer attribution link", async () => {
		const [license, footer] = await Promise.all([
			readFile(new URL("../docs/public/fonts-license.txt", import.meta.url), "utf8"),
			readFile(new URL("../docs/src/components/site-footer.astro", import.meta.url), "utf8"),
		]);
		for (const notice of ["Caveat", "IBM Plex Mono", "Source Sans 3", "SIL OPEN FONT LICENSE"]) {
			expect(license).toContain(notice);
		}
		expect(footer).not.toContain("fonts-license.txt");
	});
});
