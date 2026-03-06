import { existsSync } from "node:fs";

import { Command } from "@oclif/core";

import { run } from "../lib/exec.ts";

const GENERATED_DIR = ".j26";

export default class Down extends Command {
	static summary = "Stop the local development environment";

	static description =
		"Tears down the Docker Compose stack started by `j26 up`.";

	static examples = ["<%= config.bin %> down"];

	public async run(): Promise<void> {
		if (!existsSync(`${GENERATED_DIR}/docker-compose.yml`)) {
			this.error(
				`No ${GENERATED_DIR}/docker-compose.yml found. Run \`j26 up\` first.`,
			);
		}

		this.log("Stopping stack...");
		await run("docker", ["compose", "down"], { cwd: GENERATED_DIR });
		this.log("✅  Environment stopped.");
	}
}
