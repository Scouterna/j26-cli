import { confirm, input, Separator, select } from "@inquirer/prompts";

import { BaseCommand } from "../base-command.ts";
import { loadLocalConfig, saveLocalConfig } from "../lib/config.ts";
import { loadManifest } from "../lib/manifest.ts";
import type {
	LocalConfig,
	LocalOnlyService,
	ManifestService,
	ServiceLocalConfig,
	ServiceMode,
} from "../lib/schemas.ts";

export default class Config extends BaseCommand<typeof Config> {
	static summary = "Configure which services to run locally";

	static description = `
Select a service from the list and choose how it should run: proxy to the
cloud, run the Docker image locally, or forward to a dev server on your
machine. You can also add and remove locally-run services (forwarded to a
server on your machine). Configuration is persisted to .j26.local.yaml.

Run \`j26 up\` afterwards to apply the configuration.
  `.trim();

	static examples = [
		"<%= config.bin %> config",
		"<%= config.bin %> config --config path/to/services.yaml",
	];

	public async run(): Promise<void> {
		const manifest = await loadManifest(this.flags.config);
		const localConfig = await loadLocalConfig();

		const manifestServices = manifest.services;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			// Re-derive on every iteration so additions/removals are reflected immediately
			const localOnlyServices = Object.values(localConfig.localServices ?? {});

			const choices: Array<{ name: string; value: string } | Separator> = [];

			for (const service of manifestServices) {
				const cfg = localConfig.services[service.name];
				const modeTag = formatModeTag(cfg?.mode ?? "cloud", cfg?.hostPort);
				choices.push({
					name: `${service.name}  ${dimText(service.path)}  ${modeTag}`,
					value: service.name,
				});
			}

			if (localOnlyServices.length > 0) {
				choices.push(new Separator());
				for (const service of localOnlyServices) {
					const cfg = localConfig.services[service.name];
					const modeTag = formatModeTag("local", cfg?.hostPort);
					choices.push({
						name: `${service.name}  ${dimText(service.path)}  ${modeTag}  ${dimText("[local-only]")}`,
						value: service.name,
					});
				}
			}

			choices.push(new Separator());
			choices.push({ name: "Add local service…", value: "__add_local__" });
			choices.push({ name: "Done", value: "__done__" });

			const selected = await select<string>({
				message: "Select a service to configure",
				choices,
				pageSize: Math.min(choices.length, 20),
			});

			if (selected === "__done__") break;

			if (selected === "__add_local__") {
				const takenNames = new Set([
					...manifestServices.map((s) => s.name),
					...localOnlyServices.map((s) => s.name),
				]);
				const takenPaths = new Set([
					...manifestServices.map((s) => s.path),
					...localOnlyServices.map((s) => s.path),
				]);
				const newService = await promptNewLocalService(takenNames, takenPaths);
				localConfig.localServices = {
					...(localConfig.localServices ?? {}),
					[newService.name]: newService,
				};
				localConfig.services[newService.name] = {
					mode: "local",
					hostPort: newService.port,
				};
				continue;
			}

			const manifestService = manifestServices.find((s) => s.name === selected);
			const localOnlyService = localOnlyServices.find(
				(s) => s.name === selected,
			);
			const existing = localConfig.services[selected];

			if (manifestService) {
				const result = await configureManifestService(
					manifestService,
					existing,
				);
				// Cloud mode = absence of entry in the config file
				if (result.mode === "cloud") {
					delete localConfig.services[selected];
				} else {
					localConfig.services[selected] = result;
				}
			} else if (localOnlyService) {
				const action = await select<"port" | "remove">({
					message: `${localOnlyService.name}  ${dimText(localOnlyService.path)}  ${dimText("[local-only]")}`,
					choices: [
						{ name: "Set host port", value: "port" },
						{ name: "Remove", value: "remove" },
					],
				});
				if (action === "remove") {
					const { [selected]: _removed, ...rest } =
						localConfig.localServices ?? {};
					localConfig.localServices = rest;
					delete localConfig.services[selected];
				} else {
					localConfig.services[selected] = await configureLocalOnlyService(
						localOnlyService,
						existing,
					);
				}
			}
		}

		await saveLocalConfig(localConfig as LocalConfig);

		this.log("");
		this.log("✅  Configuration saved to .j26.local.yaml");
		this.log("    Run `j26 up` to apply.");
	}
}

async function promptNewLocalService(
	takenNames: Set<string>,
	takenPaths: Set<string>,
): Promise<LocalOnlyService> {
	const name = await input({
		message: "Service name",
		validate(value) {
			if (!value.trim()) return "Name is required";
			if (takenNames.has(value.trim()))
				return `"${value.trim()}" is already in use`;
			return true;
		},
	});

	const path = await input({
		message: "Path prefix (e.g. /my-service)",
		validate(value) {
			if (!value.startsWith("/")) return "Path must start with /";
			if (takenPaths.has(value)) return `"${value}" is already in use`;
			return true;
		},
	});

	const portRaw = await input({
		message: "Host port",
		validate(value) {
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1 || n > 65535)
				return "Enter a valid port number (1–65535)";
			return true;
		},
	});

	const rewritePath = await confirm({
		message: "Strip path prefix before forwarding?",
		default: true,
	});

	return { name: name.trim(), path, port: Number(portRaw), rewritePath };
}

async function configureManifestService(
	service: ManifestService,
	existing: ServiceLocalConfig | undefined,
): Promise<ServiceLocalConfig> {
	const mode = await select<ServiceMode>({
		message: `${service.name}  ${dimText(service.path)}`,
		choices: [
			{ name: "Cloud   — proxy requests to the cloud service", value: "cloud" },
			{ name: "Docker  — run the Docker image locally", value: "docker" },
			{
				name: "Local   — forward to a server running on your machine",
				value: "local",
			},
			{ name: "Skip    — exclude this service entirely", value: "skip" },
		],
		default: existing?.mode ?? "cloud",
	});

	let hostPort: number | undefined;
	if (mode === "local") {
		hostPort = await promptHostPort(
			service.name,
			existing?.hostPort ?? service.port,
		);
	}

	return { mode, hostPort, env: existing?.env };
}

async function configureLocalOnlyService(
	service: LocalOnlyService,
	existing: ServiceLocalConfig | undefined,
): Promise<ServiceLocalConfig> {
	const hostPort = await promptHostPort(
		service.name,
		existing?.hostPort ?? service.port,
	);
	return { mode: "local", hostPort, env: existing?.env };
}

async function promptHostPort(
	serviceName: string,
	defaultPort: number,
): Promise<number> {
	const raw = await input({
		message: `Host port for ${serviceName}`,
		default: String(defaultPort),
		validate(value) {
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1 || n > 65535)
				return "Enter a valid port number (1–65535)";
			return true;
		},
	});
	return Number(raw);
}

function formatModeTag(mode: ServiceMode, hostPort?: number): string {
	if (mode === "local") {
		const port = hostPort ? `:${hostPort}` : " (no port set)";
		return dimText(`[local${port}]`);
	}

	return dimText(`[${mode}]`);
}

function dimText(text: string): string {
	// ANSI dim — invisible in environments that don't support colour but harmless
	return `\u001B[2m${text}\u001B[0m`;
}
