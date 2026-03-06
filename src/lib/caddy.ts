import type { ServiceWithConfig } from "./schemas.js";

const DOMAIN = "local.j26.se";

/**
 * Generates a Caddyfile for the local development environment.
 *
 * Routing:
 *   - cloud: reverse-proxy to the service's cloud URL
 *   - local: reverse-proxy to the Docker Compose service by name
 *   - dev:   reverse-proxy to host.docker.internal:<hostPort>
 *
 * Path handling:
 *   - rewritePath: true  → strip the path prefix before proxying
 *   - rewritePath: false → forward the full path as-is
 */
export function generateCaddyfile(services: ServiceWithConfig[]): string {
	const blocks: string[] = [];

	// Global options
	blocks.push(
		[
			"{",
			"\t# Prevent Caddy from trying to install its CA into the container trust store",
			"\tskip_install_trust",
			"}",
		].join("\n"),
	);

	// Site block
	const siteLines: string[] = [];
	siteLines.push(`${DOMAIN} {`);
	siteLines.push("\ttls internal");

	// Sort so the root-path service ('/') is always last — it becomes the
	// catch-all fallback handler and must appear after all specific handlers.
	const sorted = [...services].sort((a, b) => {
		if (a.service.path === "/") return 1;
		if (b.service.path === "/") return -1;
		return 0;
	});

	for (const entry of sorted) {
		siteLines.push("");
		siteLines.push(...generateServiceBlock(entry));
	}

	siteLines.push("}");
	blocks.push(siteLines.join("\n"));

	return `${blocks.join("\n\n")}\n`;
}

function generateServiceBlock(entry: ServiceWithConfig): string[] {
	const { service, localConfig } = entry;
	const lines: string[] = [];

	const isRootPath = service.path === "/";

	if (isRootPath) {
		// Root-path service: use a bare `handle` block (Caddy catch-all fallback).
		// A named matcher is unnecessary and unreliable for matching all paths.
		lines.push("\thandle {");
	} else {
		// Specific-path service: named matcher using Caddy's trailing-* prefix syntax.
		// `/prefix` matches the exact path; `/prefix/*` matches all nested paths.
		const matcherName = `${service.name}_path`;
		lines.push(`\t@${matcherName} {`);
		lines.push(`\t\tpath ${service.path} ${service.path}/*`);
		lines.push(`\t}`);
		lines.push(`\thandle @${matcherName} {`);
	}

	if (service.rewritePath) {
		lines.push(`\t\turi strip_prefix ${service.path}`);
	}

	const { upstream, urlBasePath } = resolveUpstream(entry);

	// If the cloud URL has a base path (e.g. https://host/api), prepend it after
	// any prefix stripping so the upstream receives the correct path.
	if (urlBasePath && urlBasePath !== "/") {
		lines.push(`\t\trewrite {path} ${urlBasePath}{path}`);
	}

	if (localConfig.mode === "cloud") {
		// Set Host to the upstream hostname so the cloud service accepts the request
		lines.push(`\t\treverse_proxy ${upstream} {`);
		lines.push(`\t\t\theader_up Host {upstream_hostport}`);
		lines.push(`\t\t}`);
	} else {
		lines.push(`\t\treverse_proxy ${upstream}`);
	}

	lines.push(`\t}`);

	return lines;
}

function resolveUpstream(entry: ServiceWithConfig): {
	upstream: string;
	urlBasePath?: string;
} {
	const { service, localConfig } = entry;
	switch (localConfig.mode) {
		case "cloud": {
			if (!("cloudUrl" in service) || !service.cloudUrl) {
				throw new Error(
					`Service "${service.name}" has no cloudUrl but is configured for cloud mode.`,
				);
			}

			// Caddy's reverse_proxy only accepts scheme + host + port — no path.
			// Extract origin and preserve any base path separately.
			const url = new URL(service.cloudUrl);
			const upstream = url.origin;
			const urlBasePath =
				url.pathname === "/" ? undefined : url.pathname.replace(/\/$/, "");
			return { upstream, urlBasePath };
		}

		case "docker": {
			return { upstream: `${service.name}:${service.port}` };
		}

		case "local": {
			if (!localConfig.hostPort) {
				throw new Error(
					`Service "${service.name}" is in dev mode but has no hostPort configured.`,
				);
			}

			return { upstream: `host.docker.internal:${localConfig.hostPort}` };
		}

		case "skip": {
			// skip services are filtered out before reaching the Caddyfile generator
			throw new Error(
				`Service "${service.name}" is in skip mode and should not be passed to generateCaddyfile.`,
			);
		}
	}
}
