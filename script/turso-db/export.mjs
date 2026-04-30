import fs from "node:fs";
import path from "node:path";

import {
	createRemoteClient,
	exitWithError,
	exportDatabaseToSql,
	getDatabaseConfig,
	getDatabaseNameFromUrl,
	loadConfigFile,
	printUsage,
	resolvePath,
	scriptDir,
	timestamp,
} from "./shared.mjs";

function usage() {
	printUsage(`Usage:
  node export.mjs

Examples:
  node export.mjs

Notes:
  - source.url and source.authToken are read from config.json.
  - dumpFile in config.json is used as the export output path.
  - If dumpFile is empty, a timestamped .sql file is created in backupDir.
  - This script connects directly with @libsql/client and does not require turso auth login.`);
}

const config = loadConfigFile();

const args = process.argv.slice(2);

if (args[0] === "-h" || args[0] === "--help") {
	usage();
	process.exit(0);
}

if (args.length > 0) {
	usage();
	exitWithError("export.mjs does not accept positional arguments. Set dumpFile in config.json.");
}

const sourceConfig = getDatabaseConfig(config.source, "source");
const backupDir = resolvePath(config.backupDir || "./backups", scriptDir);
const databaseName = getDatabaseNameFromUrl(sourceConfig.url);

let outputFile = config.dumpFile;

fs.mkdirSync(backupDir, { recursive: true });

if (!outputFile) {
	outputFile = path.join(backupDir, `${databaseName}-${timestamp()}.sql`);
}

const absoluteOutputFile = resolvePath(outputFile, scriptDir);
const outputDir = path.dirname(absoluteOutputFile);
const tempFile = `${absoluteOutputFile}.tmp.${process.pid}`;

fs.mkdirSync(outputDir, { recursive: true });

if (fs.existsSync(absoluteOutputFile)) {
	exitWithError(`output file already exists: ${absoluteOutputFile}`);
}

const client = createRemoteClient(sourceConfig);

try {
	process.stdout.write(`Exporting database '${databaseName}' from ${sourceConfig.url}...\n`);
	const sql = await exportDatabaseToSql(client);
	fs.writeFileSync(tempFile, sql, "utf8");
	fs.renameSync(tempFile, absoluteOutputFile);
	process.stdout.write(`Export complete: ${absoluteOutputFile}\n`);
} catch (error) {
	fs.rmSync(tempFile, { force: true });
	exitWithError(error instanceof Error ? error.message : String(error));
} finally {
	client.close();
}
