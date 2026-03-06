import { readFile } from "node:fs/promises";
import { type } from "arktype";
import yaml from "js-yaml";
import type { Manifest } from "./schemas.js";
import { ManifestSchema } from "./schemas.js";

export async function loadManifest(filePath: string): Promise<Manifest> {
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		throw new Error(
			`Could not read services manifest at "${filePath}". Does the file exist?`,
		);
	}

	let raw: unknown;
	try {
		raw = yaml.load(content);
	} catch (err) {
		throw new Error(
			`Failed to parse "${filePath}" as YAML: ${(err as Error).message}`,
		);
	}

	const result = ManifestSchema(raw);
	if (result instanceof type.errors) {
		throw new Error(
			`Invalid services manifest "${filePath}":\n${result.summary}`,
		);
	}

	return result as Manifest;
}
