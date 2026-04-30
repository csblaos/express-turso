import fs from "node:fs";
import path from "node:path";

import {
	createRemoteClient,
	exitWithError,
	getDatabaseConfig,
	loadConfigFile,
	printUsage,
	resolvePath,
	scriptDir,
} from "./shared.mjs";

function usage() {
	printUsage(`Usage:
  node restore.mjs [dump-file]

Examples:
  node restore.mjs
  node restore.mjs ./backups/source.sql

Notes:
  - If dump-file is omitted, dumpFile from config.json is used.
  - If dumpFile is empty, the script falls back to ./backups/latest.sql inside script/turso-db.
  - target.url and target.authToken from config.json are required.
  - Restoring into an existing non-empty database can fail because the dump recreates schema and data.
  - This script restores only into an existing target database.`);
}

const config = loadConfigFile();

const args = process.argv.slice(2);

if (args[0] === "-h" || args[0] === "--help") {
	usage();
	process.exit(0);
}

const positionalArgs = [];

for (let index = 0; index < args.length; index += 1) {
	const value = args[index];

	if (value.startsWith("-")) {
		usage();
		exitWithError(`unknown option '${value}'`);
	}

	positionalArgs.push(value);
}

const backupDir = resolvePath(config.backupDir || "./backups", scriptDir);
const dumpFile = positionalArgs[0] || config.dumpFile || path.join(backupDir, "latest.sql");

if (!dumpFile) {
	usage();
	exitWithError("dump file is required.");
}

const absoluteDumpFile = resolvePath(dumpFile, scriptDir);

if (!fs.existsSync(absoluteDumpFile)) {
	exitWithError(`dump file not found: ${absoluteDumpFile}. Set dumpFile in config.json or create the file first with export.mjs.`);
}

const targetConfig = getDatabaseConfig(config.target, "target");
const sql = fs.readFileSync(absoluteDumpFile, "utf8");
const client = createRemoteClient(targetConfig);

try {
	process.stdout.write(`Restoring dump into target database ${targetConfig.url}...\n`);
	await client.executeMultiple(sql);
	process.stdout.write("Restore complete.\n");
} catch (error) {
	exitWithError(error instanceof Error ? error.message : String(error));
} finally {
	client.close();
}
