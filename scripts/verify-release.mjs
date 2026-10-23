import { readFileSync } from "node:fs";

function git(...args) {
	const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "inherit" });
	if (result.exitCode !== 0) {
		throw new Error(`Git verification failed: ${args.join(" ")}`);
	}
	return result.stdout.toString().trim();
}
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
	throw new Error("Missing GitHub release event");
}
const { release } = JSON.parse(readFileSync(eventPath, "utf8"));
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)) {
	throw new Error("Unsupported release version");
}
if (release.tag_name !== `v${version}`) {
	throw new Error("Release tag/version mismatch");
}
const prerelease = version.includes("-");
if (release.prerelease !== prerelease || release.draft) {
	throw new Error("Release prerelease/draft mismatch");
}
// Require a named, protected source branch, not an ambiguous SHA target.
if (release.target_commitish !== "main") {
	throw new Error("Release must target main");
}
const tagCommit = git("rev-parse", `refs/tags/v${version}^{commit}`);
if (tagCommit !== git("rev-parse", "HEAD") || tagCommit !== process.env.GITHUB_SHA) {
	throw new Error("Release checkout/tag/event commit mismatch");
}
git("merge-base", "--is-ancestor", tagCommit, "refs/remotes/origin/main");
const distTag = prerelease ? "beta" : "latest";
if (process.env.GITHUB_OUTPUT) {
	const { appendFileSync } = await import("node:fs");
	appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${distTag}\n`);
}
process.stdout.write(`Verified ${release.tag_name} at ${tagCommit}; npm dist-tag: ${distTag}\n`);
