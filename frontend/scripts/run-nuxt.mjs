import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "..");
const nuxtEntry = path.join(frontendDir, "node_modules", "nuxt", "bin", "nuxt.mjs");

const MIN_NODE = [ 20, 19, 0 ];

function parseVersion(raw) {
	const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
	if (!match) return null;
	return match.slice(1).map((value) => Number(value));
}

function compareVersions(left, right) {
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const l = left[index] ?? 0;
		const r = right[index] ?? 0;
		if (l > r) return 1;
		if (l < r) return -1;
	}
	return 0;
}

function supportsNuxt4(version) {
	if (!version) return false;
	return compareVersions(version, MIN_NODE) >= 0;
}

function resolveNvmCandidates() {
	const nvmRoot = path.join(os.homedir(), ".nvm", "versions", "node");
	if (!existsSync(nvmRoot)) return [];

	return readdirSync(nvmRoot)
		.map((entry) => path.join(nvmRoot, entry, "bin", "node"))
		.filter((candidate) => existsSync(candidate));
}

function resolveCandidateBinaries() {
	const candidates = new Set([
		process.execPath,
		process.env.NUXT_NODE_BIN,
		process.env.NVM_BIN ? path.join(process.env.NVM_BIN, "node") : null,
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		"/usr/bin/node",
		"/Users/csl-dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node",
	]);

	for (const candidate of resolveNvmCandidates()) {
		candidates.add(candidate);
	}

	return [ ...candidates ].filter(Boolean);
}

function inspectBinary(binary) {
	if (!existsSync(binary)) return null;

	const result = spawnSync(binary, [ "-v" ], {
		encoding: "utf8",
		stdio: [ "ignore", "pipe", "ignore" ],
	});

	if (result.status !== 0 || !result.stdout) return null;

	const version = parseVersion(result.stdout);
	if (!supportsNuxt4(version)) return null;

	return { binary, version };
}

function pickNodeBinary() {
	const compatible = resolveCandidateBinaries()
		.map(inspectBinary)
		.filter(Boolean)
		.sort((left, right) => compareVersions(right.version, left.version));

	return compatible[0] ?? null;
}

const selectedNode = pickNodeBinary();

if (!selectedNode) {
	console.error(
		[
			"Nuxt 4 requires Node.js >= 20.19.0.",
			"No compatible Node binary was found automatically.",
			"Set NUXT_NODE_BIN to a compatible node path or install Node 22/24 locally.",
		].join("\n"),
	);
	process.exit(1);
}

const commandArgs = [ nuxtEntry, ...process.argv.slice(2) ];
const result = spawnSync(selectedNode.binary, commandArgs, {
	cwd: frontendDir,
	stdio: "inherit",
	env: process.env,
});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status ?? 0);
