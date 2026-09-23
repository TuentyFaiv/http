import cloudflare from "@astrojs/cloudflare";
import starlight from "@astrojs/starlight";
import { defineConfig, sessionDrivers } from "astro/config";

export default defineConfig({
	site: process.env.DOCS_SITE || "https://http.tuentyfaiv.com",
	adapter: cloudflare({ prerenderEnvironment: "node", imageService: "compile" }),
	// Demos do not use sessions; avoid the adapter's automatic KV provisioning.
	session: { driver: sessionDrivers.null() },
	trailingSlash: "always",
	integrations: [
		starlight({
			// A body stylesheet blocks parsing below the first code block on slow connections.
			expressiveCode: { emitExternalStylesheet: false },
			title: "@tuentyfaiv/http",
			description: "A fetch-based http client with opinionated defaults and swappable conventions.",
			defaultLocale: "root",
			locales: {
				root: { label: "English (US)", lang: "en-US" },
				"es-mx": { label: "Español (México)", lang: "es-MX" },
			},
			customCss: ["./src/styles/custom.css", "./src/styles/docs-layout.css"],
			components: {
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
					items: [
						{ label: "Introduction", translations: { "es-MX": "Introducción" }, slug: "index" },
						{ slug: "getting-started" },
					],
				},
				{
					label: "Guides",
					translations: { "es-MX": "Guías" },
					items: [{ autogenerate: { directory: "guides" } }],
				},
				{
					label: "Examples",
					translations: { "es-MX": "Ejemplos" },
					items: [{ slug: "examples/live" }],
				},
				{
					label: "Recipes",
					translations: { "es-MX": "Recetas" },
					items: [{ autogenerate: { directory: "recipes" } }],
				},
			],
		}),
	],
});
