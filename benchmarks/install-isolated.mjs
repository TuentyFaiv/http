import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = import.meta.dir;
const temporary = await mkdtemp(join(tmpdir(), "http-comparison-"));
try {
	await cp(join(directory, "package.json"), join(temporary, "package.json"));
	const lock = Bun.file(join(directory, "bun.lock"));
	if (await lock.exists()) {
		await cp(lock.name, join(temporary, "bun.lock"));
	}
	const child = Bun.spawn(
		[
			process.execPath,
			"install",
			"--ignore-scripts",
			"--no-progress",
			"--cache-dir",
			join(directory, ".cache"),
			...((await lock.exists()) ? ["--frozen-lockfile"] : []),
		],
		{ cwd: temporary, stdout: "inherit", stderr: "inherit" }
	);
	if ((await child.exited) !== 0) {
		throw new Error("Isolated dependency installation failed");
	}
	await cp(join(temporary, "node_modules"), join(directory, "node_modules"), { recursive: true, dereference: true });
	await cp(join(temporary, "bun.lock"), join(directory, "bun.lock"));
} finally {
	await rm(temporary, { recursive: true, force: true });
}
