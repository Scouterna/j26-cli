import yaml from "js-yaml";

import type { ServiceWithConfig } from "./schemas.ts";

/**
 * Generates a docker-compose.yml string for the local development stack.
 *
 * Always includes:
 *   - caddy: the reverse proxy (ports 80 + 443, Caddyfile bind-mounted, persistent data volumes)
 *
 * For each service in "local" mode, adds a container using the service's Docker image,
 * merging manifest-level env vars with any local overrides.
 */
export function generateDockerCompose(services: ServiceWithConfig[]): string {
	const localServices = services.filter(
		({ localConfig }) => localConfig.mode === "docker",
	);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// biome-ignore lint/suspicious/noExplicitAny: It's easier this way
	const composeServices: Record<string, any> = {
		caddy: {
			image: "caddy:2",
			ports: ["80:80", "443:443"],
			volumes: [
				// Caddyfile is sibling to docker-compose.yml inside .j26/
				"./Caddyfile:/etc/caddy/Caddyfile:ro",
				"caddy_data:/data",
				"caddy_config:/config",
			],
			networks: ["j26"],
			// Required on Linux — Docker Desktop adds this automatically on Mac/Windows
			extra_hosts: ["host.docker.internal:host-gateway"],
			restart: "unless-stopped",
		},
	};

	for (const { service, localConfig } of localServices) {
		// localServices only contains ManifestService entries (local-only services are always dev mode)
		if (!("dockerImage" in service)) continue;

		// Merge manifest env with local overrides (local overrides win)
		const mergedEnv: Record<string, string> = {
			...service.env,
			...localConfig.env,
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// biome-ignore lint/suspicious/noExplicitAny: It's easier this way
		const serviceSpec: Record<string, any> = {
			image: service.dockerImage,
			networks: ["j26"],
			restart: "unless-stopped",
		};

		if (Object.keys(mergedEnv).length > 0) {
			serviceSpec.environment = Object.entries(mergedEnv).map(
				([k, v]) => `${k}=${v}`,
			);
		}

		composeServices[service.name] = serviceSpec;
	}

	const compose = {
		services: composeServices,
		networks: {
			j26: {},
		},
		volumes: {
			caddy_data: {},
			caddy_config: {},
		},
	};

	return yaml.dump(compose, { indent: 2, noRefs: true, lineWidth: -1 });
}
