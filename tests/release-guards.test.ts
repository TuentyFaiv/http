import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ read: vi.fn(), append: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: io.read, appendFileSync: io.append }));

const modulePath = "../scripts/verify-release.mjs";
const sha = "0123456789abcdef0123456789abcdef01234567";
let version: string;
let release: {
	tag_name: string;
	prerelease: boolean;
	draft: boolean;
	target_commitish: string;
};
const git = vi.fn();

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	version = "0.2.0-beta.1";
	release = {
		tag_name: `v${version}`,
		prerelease: true,
		draft: false,
		target_commitish: "main",
	};
	io.read.mockImplementation((file: string) => JSON.stringify(file === "package.json" ? { version } : { release }));
	git.mockReturnValue({ exitCode: 0, stdout: Buffer.from(sha) });
	vi.stubGlobal("Bun", { spawnSync: git });
	vi.stubEnv("GITHUB_EVENT_PATH", "mock-event.json");
	vi.stubEnv("GITHUB_SHA", sha);
	vi.stubEnv("GITHUB_OUTPUT", "mock-output");
	vi.spyOn(process.stdout, "write").mockReturnValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("release guards", () => {
	it("publishes a matching beta only to beta after exact commit and ancestry checks", async () => {
		await import(modulePath);
		expect(io.append).toHaveBeenCalledWith("mock-output", "dist-tag=beta\n");
		expect(git.mock.calls.map(([command]) => command)).toEqual([
			["git", "rev-parse", "refs/tags/v0.2.0-beta.1^{commit}"],
			["git", "rev-parse", "HEAD"],
			["git", "merge-base", "--is-ancestor", sha, "refs/remotes/origin/main"],
		]);
	});

	it("publishes a matching non-prerelease to latest", async () => {
		version = "0.2.0";
		release.tag_name = `v${version}`;
		release.prerelease = false;
		await import(modulePath);
		expect(io.append).toHaveBeenCalledWith("mock-output", "dist-tag=latest\n");
	});

	it("rejects missing release-event context without running Git", async () => {
		vi.stubEnv("GITHUB_EVENT_PATH", "");
		await expect(import(modulePath)).rejects.toThrow("Missing GitHub release event");
		expect(git).not.toHaveBeenCalled();
	});

	it.each(["0.2.0-rc.1", "0.2.0-beta", "0.2.0+build", "not-a-version"])(
		"rejects unsupported version %s",
		async (invalid) => {
			version = invalid;
			await expect(import(modulePath)).rejects.toThrow("Unsupported release version");
			expect(io.append).not.toHaveBeenCalled();
		}
	);

	it("rejects a tag/version mismatch", async () => {
		release.tag_name = "v0.1.15";
		await expect(import(modulePath)).rejects.toThrow("Release tag/version mismatch");
		expect(git).not.toHaveBeenCalled();
	});

	it("rejects a beta marked as a stable GitHub release", async () => {
		release.prerelease = false;
		await expect(import(modulePath)).rejects.toThrow("Release prerelease/draft mismatch");
	});

	it("rejects a stable version marked as a GitHub prerelease", async () => {
		version = "0.2.0";
		release.tag_name = `v${version}`;
		await expect(import(modulePath)).rejects.toThrow("Release prerelease/draft mismatch");
	});

	it("rejects draft releases", async () => {
		release.draft = true;
		await expect(import(modulePath)).rejects.toThrow("Release prerelease/draft mismatch");
	});

	it.each(["feature/beta", sha])("rejects release target %s", async (target) => {
		release.target_commitish = target;
		await expect(import(modulePath)).rejects.toThrow("Release must target main");
		expect(git).not.toHaveBeenCalled();
	});

	it("rejects a checkout that differs from the tag commit", async () => {
		git.mockReturnValueOnce({ exitCode: 0, stdout: Buffer.from("another-commit") });
		await expect(import(modulePath)).rejects.toThrow("Release checkout/tag/event commit mismatch");
		expect(io.append).not.toHaveBeenCalled();
	});

	it("rejects an event SHA that differs from the tag commit", async () => {
		vi.stubEnv("GITHUB_SHA", "another-commit");
		await expect(import(modulePath)).rejects.toThrow("Release checkout/tag/event commit mismatch");
		expect(io.append).not.toHaveBeenCalled();
	});

	it("rejects a tag that is not on the fetched main branch", async () => {
		git.mockImplementation((command: string[]) => ({
			exitCode: command.includes("merge-base") ? 1 : 0,
			stdout: Buffer.from(sha),
		}));
		await expect(import(modulePath)).rejects.toThrow("Git verification failed: merge-base");
		expect(io.append).not.toHaveBeenCalled();
	});

	it("fails closed when the tag cannot be resolved", async () => {
		git.mockReturnValue({ exitCode: 1, stdout: Buffer.from("") });
		await expect(import(modulePath)).rejects.toThrow("Git verification failed: rev-parse");
		expect(io.append).not.toHaveBeenCalled();
	});
});
