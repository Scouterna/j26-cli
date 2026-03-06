import { Command, Flags, type Interfaces } from "@oclif/core";
import { checkForUpdate } from "./lib/update-check.js";

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<
	typeof BaseCommand.baseFlags & T["flags"]
>;

export abstract class BaseCommand<T extends typeof Command> extends Command {
	static baseFlags = {
		config: Flags.string({
			char: "c",
			description: "Path to the services manifest",
			default: "services.yaml",
			helpValue: "<path>",
		}),
	};

	protected flags!: BaseFlags<T>;

	public async init(): Promise<void> {
		await super.init();
		const { flags } = await this.parse({
			flags: this.ctor.flags,
			baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
			enableJsonFlag: this.ctor.enableJsonFlag,
			args: this.ctor.args,
			strict: this.ctor.strict,
		});
		this.flags = flags as BaseFlags<T>;
	}

	protected async finally(_err: Error | undefined): Promise<void> {
		await super.finally(_err);
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
	}
}
