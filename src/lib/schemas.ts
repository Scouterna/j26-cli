import { type } from "arktype";

export const ManifestServiceSchema = type({
	name: "string > 0",
	path: /^\//,
	cloudUrl: "string.url",
	dockerImage: "string > 0",
	port: "number.integer > 0",
	rewritePath: "boolean = true",
	"env?": { "[string]": "string" },
});

export type ManifestService = typeof ManifestServiceSchema.infer;

export const ManifestSchema = type({
	services: ManifestServiceSchema.array().atLeastLength(1),
});

export type Manifest = typeof ManifestSchema.infer;

/**
 * A service defined only in .j26.local.yaml — always forwarded to a dev server
 * running on the host machine. Not started by this CLI.
 */
export const LocalOnlyServiceSchema = type({
	name: "string > 0",
	path: /^\//,
	/** Default port used as the pre-filled value when prompting for a host port */
	port: "number.integer > 0",
	rewritePath: "boolean = true",
});

export type LocalOnlyService = typeof LocalOnlyServiceSchema.infer;

/** Union of all service types */
export type Service = ManifestService | LocalOnlyService;

export const ServiceLocalConfigSchema = type({
	mode: "'cloud' | 'docker' | 'local' | 'skip'",
	"hostPort?": "number.integer > 0",
	"env?": { "[string]": "string" },
});

export type ServiceLocalConfig = typeof ServiceLocalConfigSchema.infer;

export type ServiceMode = ServiceLocalConfig["mode"];

export const LocalConfigSchema = type({
	services: { "[string]": ServiceLocalConfigSchema },
	"localServices?": { "[string]": LocalOnlyServiceSchema },
});

export type LocalConfig = typeof LocalConfigSchema.infer;

export interface ServiceWithConfig {
	service: Service;
	localConfig: ServiceLocalConfig;
}
