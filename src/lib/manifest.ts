import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type } from "arktype";
import yaml from "js-yaml";
import type { Manifest } from "./schemas.js";
import { ManifestSchema } from "./schemas.js";

// Compiled module lives at dist/src/lib/manifest.js — three levels up is the package root.
const BUNDLED_MANIFEST_URL = new URL("../../../services.yaml", import.meta.url);

async function pathExists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

export async function loadManifest(filePath: string): Promise<Manifest> {
	const localExists = await pathExists(filePath);
	const bundledPath = fileURLToPath(BUNDLED_MANIFEST_URL);
	const pathToLoad = localExists ? filePath : bundledPath;

	if (!localExists) {
		process.stderr.write(
			`Warning: "${filePath}" not found in current directory — using the bundled services manifest.\n`,
		);
	}

	let content: string;
	try {
		content = await readFile(pathToLoad, "utf8");
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
