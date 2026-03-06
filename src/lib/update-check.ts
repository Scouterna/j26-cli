import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_NAME = "@scouterna/j26-cli";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 3000;
const CACHE_FILE = "update-cache.json";

interface UpdateCache {
	checkedAt: number;
	latestVersion: string;
}

export interface UpdateInfo {
	currentVersion: string;
	latestVersion: string;
}

/** Returns true if semver `a` is strictly greater than `b`. */
function semverGt(a: string, b: string): boolean {
	const parse = (v: string) =>
		v
			.replace(/[^0-9.]/g, "")
			.split(".")
			.map(Number);
	const [aMaj = 0, aMin = 0, aPat = 0] = parse(a);
	const [bMaj = 0, bMin = 0, bPat = 0] = parse(b);
	if (aMaj !== bMaj) return aMaj > bMaj;
	if (aMin !== bMin) return aMin > bMin;
	return aPat > bPat;
}

async function readCache(cacheDir: string): Promise<string | null> {
	try {
		const raw = await readFile(join(cacheDir, CACHE_FILE), "utf8");
		const cache: UpdateCache = JSON.parse(raw);
		if (Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) {
			return cache.latestVersion;
		}
	} catch {
		// Cache missing, corrupt, or stale — fetch fresh
	}
	return null;
}

async function fetchLatestVersion(cacheDir: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
			{ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { version: string };
		const latest = data.version;

		// Persist to cache
		await mkdir(cacheDir, { recursive: true });
		await writeFile(
			join(cacheDir, CACHE_FILE),
			JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }),
			"utf8",
		);

		return latest;
	} catch {
		return null;
	}
}

/**
 * Checks npm for the latest version of the CLI.
 * Returns an `UpdateInfo` object if a newer version is available, otherwise `null`.
 * Results are cached in `cacheDir` for 24 hours to keep commands fast.
 */
export async function checkForUpdate(
	currentVersion: string,
	cacheDir: string,
): Promise<UpdateInfo | null> {
	const latestVersion =
		(await readCache(cacheDir)) ?? (await fetchLatestVersion(cacheDir));

	if (!latestVersion || !semverGt(latestVersion, currentVersion)) {
		return null;
	}

	return { currentVersion, latestVersion };
}
