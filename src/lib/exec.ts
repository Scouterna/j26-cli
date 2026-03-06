import { spawn } from "node:child_process";

export interface RunOptions {
	/** Working directory for the command */
	cwd?: string;
}

/**
 * Spawns a command and inherits stdio so output streams directly to the terminal.
 * Resolves when the process exits with code 0, rejects otherwise.
 */
export function run(
	command: string,
	args: string[],
	options: RunOptions = {},
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: "inherit",
		});

		child.on("error", (err) => {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				reject(
					new Error(
						`Command not found: "${command}". Is it installed and on your PATH?`,
					),
				);
			} else {
				reject(err);
			}
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(`"${command} ${args.join(" ")}" exited with code ${code}`),
				);
			}
		});
	});
}
