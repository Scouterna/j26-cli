import { BaseCommand } from "../base-command.js";
import { loadLocalConfig } from "../lib/config.js";
import { loadManifest } from "../lib/manifest.js";
import type { ServiceLocalConfig } from "../lib/schemas.js";

interface ServiceStatus {
	name: string;
	path: string;
	mode: string;
	rewritePath: boolean;
	details: string;
}

export default class Status extends BaseCommand<typeof Status> {
	static summary = "Show the status of all services";

	static description =
		"Displays the current mode for every service defined in the manifest. " +
		"Pass --json for machine-readable output.";

	static examples = [
		"<%= config.bin %> status",
		"<%= config.bin %> status --json",
	];

	static enableJsonFlag = true;

	static flags = {
		// --config is inherited from BaseCommand
	};

	public async run(): Promise<{ services: ServiceStatus[] } | undefined> {
		const manifest = await loadManifest(this.flags.config);
		const localConfig = await loadLocalConfig();

		const statuses: ServiceStatus[] = manifest.services.map((service) => {
			const cfg: ServiceLocalConfig = localConfig.services[service.name] ?? {
				mode: "cloud",
			};
			return {
				name: service.name,
				path: service.path,
				mode: cfg.mode,
				rewritePath: service.rewritePath,
				details: buildDetails(cfg),
			};
		});

		// Local-only services defined in .j26.local.yaml
		for (const service of Object.values(localConfig.localServices ?? {})) {
			const cfg: ServiceLocalConfig = localConfig.services[service.name] ?? {
				mode: "local",
			};
			statuses.push({
				name: `${service.name} *`,
				path: service.path,
				mode: cfg.mode,
				rewritePath: service.rewritePath,
				details: buildDetails(cfg),
			});
		}

		if (this.jsonEnabled()) {
			return { services: statuses };
		}

		this.printTable(statuses);
	}

	private printTable(rows: ServiceStatus[]): void {
		const COL = { name: 20, path: 20, mode: 10, rewrite: 10 };
		const header =
			"NAME".padEnd(COL.name) +
			"PATH".padEnd(COL.path) +
			"MODE".padEnd(COL.mode) +
			"REWRITE".padEnd(COL.rewrite) +
			"DETAILS";
		const divider = "─".repeat(header.length);

		this.log("");
		this.log(header);
		this.log(divider);

		for (const row of rows) {
			this.log(
				row.name.padEnd(COL.name) +
					row.path.padEnd(COL.path) +
					row.mode.padEnd(COL.mode) +
					String(row.rewritePath).padEnd(COL.rewrite) +
					row.details,
			);
		}

		this.log("");
	}
}

function buildDetails(cfg: ServiceLocalConfig): string {
	switch (cfg.mode) {
		case "cloud":
			return "proxied to cloud";
		case "docker":
			return "running in Docker";
		case "local":
			return cfg.hostPort
				? `forwarded to localhost:${cfg.hostPort}`
				: "local (run j26 config to set port)";
		case "skip":
			return "excluded";
	}
}
