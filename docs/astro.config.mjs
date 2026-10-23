import cloudflare from "@astrojs/cloudflare";
import mdx from "@astrojs/mdx";
import starlight from "@astrojs/starlight";
import { defineConfig, sessionDrivers } from "astro/config";

import { codeThemes } from "./src/code-themes.mjs";

export default defineConfig({
	site: process.env.DOCS_SITE || "https://http.tuentyfaiv.com",
	adapter: cloudflare({ prerenderEnvironment: "node", imageService: "compile" }),
	// Demos do not use sessions; avoid the adapter's automatic KV provisioning.
	session: { driver: sessionDrivers.null() },
	trailingSlash: "always",
	integrations: [
		starlight({
			// A body stylesheet blocks parsing below the first code block on slow connections.
			expressiveCode: {
				emitExternalStylesheet: false,
				themes: codeThemes,
				useStarlightDarkModeSwitch: true,
				useStarlightUiThemeColors: false,
				styleOverrides: {
					codeFontFamily: '"IBM Plex Mono", Consolas, monospace',
					codeFontSize: "1rem",
					codeLineHeight: "1.7",
					borderColor: "var(--fz-border)",
					borderRadius: "calc(var(--fz-radius-panel) - 1px)",
					uiFontFamily: '"Source Sans 3 Variable", sans-serif',
					uiFontSize: "1rem",
					frames: {
						frameBoxShadowCssValue: "none",
						editorActiveTabBackground: "var(--fz-code-bg)",
						editorActiveTabForeground: "var(--fz-ink)",
						editorTabBarBackground: "var(--fz-code-bg)",
						terminalBackground: "var(--fz-code-bg)",
						terminalTitlebarBackground: "var(--fz-code-bg)",
						terminalTitlebarForeground: "var(--fz-muted)",
						inlineButtonForeground: "var(--fz-ink)",
						inlineButtonBackground: "var(--fz-code-bg)",
						inlineButtonBorder: "var(--fz-border)",
						inlineButtonBorderOpacity: "1",
						inlineButtonBackgroundIdleOpacity: "1",
						inlineButtonBackgroundHoverOrFocusOpacity: "1",
						inlineButtonBackgroundActiveOpacity: "1",
						tooltipSuccessBackground: "var(--fz-violet)",
						tooltipSuccessForeground: "var(--fz-page)",
					},
				},
			},
			title: "FetchZen",
			description: "Typed requests. Clear results. A dependency-free HTTP client built on native Fetch.",
			favicon: "/favicon.svg",
			defaultLocale: "root",
			locales: {
				root: { label: "English (US)", lang: "en-US" },
				"es-mx": { label: "Español (México)", lang: "es-MX" },
			},
			customCss: ["./src/styles/custom.css", "./src/styles/docs-layout.css"],
			components: {
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				Head: "./src/components/starlight-head.astro",
				// The bypass link is visible in the sidebar, not revealed over the header on Tab.
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				SkipLink: "./src/components/skip-link.astro",
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				Sidebar: "./src/components/sidebar.astro",
				// Starlight requires component override keys to match its PascalCase names.
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				Hero: "./src/components/http-hero.astro",
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				Footer: "./src/components/site-footer.astro",
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				SiteTitle: "./src/components/site-title.astro",
				// biome-ignore lint/style/useNamingConvention: required by the Starlight integration
				LanguageSelect: "./src/components/language-select.astro",
			},
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/TuentyFaiv/http" }],
			editLink: {
				baseUrl: "https://github.com/TuentyFaiv/http/edit/main/docs/src/content/docs/",
			},
			sidebar: [
				{
					label: "Start here",
					translations: { "es-MX": "Comienza aquí" },
					items: [{ slug: "getting-started" }],
				},
				{
					label: "Guides",
					translations: { "es-MX": "Guías" },
					items: [{ autogenerate: { directory: "guides" } }],
				},
				{
					label: "Examples",
					translations: { "es-MX": "Ejemplos" },
					items: [
						{
							label: "Basics",
							translations: { "es-MX": "Fundamentos" },
							items: ["live", "json", "validation", "safe-errors", "transforms", "configuration"].map((page) => ({
								slug: `examples/${page}`,
							})),
						},
						{
							label: "Request lifecycle",
							translations: { "es-MX": "Ciclo de solicitud" },
							items: ["hooks", "retries", "timeout-cancellation", "safe-request"].map((page) => ({
								slug: `examples/${page}`,
							})),
						},
						{
							label: "Files and streams",
							translations: { "es-MX": "Archivos y flujos" },
							items: ["file-upload", "confirmed-upload", "multipart", "download", "streaming"].map((page) => ({
								slug: `examples/${page}`,
							})),
						},
					],
				},
				{
					label: "Recipes",
					translations: { "es-MX": "Recetas" },
					items: [{ autogenerate: { directory: "recipes" } }],
				},
			],
		}),
		// Run after Starlight's code-block integration; explicitly keep GFM tables enabled in MDX.
		mdx({ gfm: true, optimize: true }),
	],
});
