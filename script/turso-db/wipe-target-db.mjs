import {
	createRemoteClient,
	exitWithError,
	getDatabaseConfig,
	loadConfigFile,
	printUsage,
	quoteIdentifier,
} from "./shared.mjs";

function usage() {
	printUsage(`Usage:
  node wipe-target-db.mjs

Examples:
  node wipe-target-db.mjs

Notes:
  - target.url and target.authToken from config.json are required.
  - This script drops all user tables, views, triggers, and indexes in the target database.
  - This is destructive and intended to prepare the target database for restore.`);
}

const args = process.argv.slice(2);

if (args[0] === "-h" || args[0] === "--help") {
	usage();
	process.exit(0);
}

if (args.length > 0) {
	usage();
	exitWithError("wipe-target-db.mjs does not accept positional arguments.");
}

const config = loadConfigFile();
const targetConfig = getDatabaseConfig(config.target, "target");
const client = createRemoteClient(targetConfig);

try {
	const masterResult = await client.execute(`
		SELECT type, name
		FROM sqlite_master
		WHERE name NOT LIKE 'sqlite_%'
			AND type IN ('trigger', 'view', 'table', 'index')
		ORDER BY
			CASE type
				WHEN 'trigger' THEN 0
				WHEN 'view' THEN 1
				WHEN 'table' THEN 2
				WHEN 'index' THEN 3
				ELSE 4
			END,
			name
	`);

	const objects = masterResult.rows.map((row) => ({
		type: String(row.type),
		name: String(row.name),
	}));

	if (objects.length === 0) {
		process.stdout.write(`Target database ${targetConfig.url} is already empty.\n`);
		process.exit(0);
	}

	const dropStatements = [
		"PRAGMA foreign_keys=OFF;",
		...objects.map(({ type, name }) => `DROP ${type.toUpperCase()} IF EXISTS ${quoteIdentifier(name)};`),
		"PRAGMA foreign_keys=ON;",
	];

	process.stdout.write(`Wiping target database ${targetConfig.url}...\n`);
	await client.executeMultiple(dropStatements.join("\n"));
	process.stdout.write(`Wipe complete. Dropped ${objects.length} objects.\n`);
} catch (error) {
	exitWithError(error instanceof Error ? error.message : String(error));
} finally {
	client.close();
}
