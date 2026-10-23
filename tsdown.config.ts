import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	dts: true,
	entry: ["src/index.ts", "src/helpers.ts"],
	format: ["esm"],
	minify: true,
	outDir: "dist",
	platform: "neutral",
});
