import type { Hook } from "@oclif/core";
import { checkForUpdate } from "../lib/update-check.js";

const hook: Hook.Finally = async function () {
	try {
		const update = await checkForUpdate(
			this.config.version,
			this.config.cacheDir,
		);
		if (update) {
			process.stderr.write(
				`\n ⚠  Update available: ${update.currentVersion} → ${update.latestVersion}\n` +
					`    Run: npm i -g @scouterna/j26-cli\n\n`,
			);
		}
	} catch {
		// Never let an update check failure affect the command
	}
};

export default hook;
