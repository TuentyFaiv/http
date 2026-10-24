import { createRequire } from "node:module";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const requireDocs = createRequire(new URL("../docs/package.json", import.meta.url));
const { experimental_readRawConfig } = requireDocs("wrangler");

describe("docs deployment observability", () => {
	it("preserves logs, traces, and Issues through the source Wrangler configuration", () => {
		const source = resolve("docs/wrangler.jsonc");
		const { rawConfig, configPath } = experimental_readRawConfig({ config: source }, { useRedirectIfAvailable: false });
		expect(configPath).toBe(source);
		expect(rawConfig.observability).toMatchObject({
			enabled: true,
			logs: { enabled: true, head_sampling_rate: 1 },
			traces: { enabled: true, head_sampling_rate: 1 },
			issues: { enabled: true },
		});
	});
});
