import "dotenv/config";

import { createClient } from "@libsql/client";

const LEGACY_TO_ACTION_PERMISSION_MAP = {
	"products.read": [ "products.view" ],
	"products.deactivate": [ "products.archive" ],
	"inventory.read": [ "inventory.view" ],
	"activity.read": [ "activity.view" ],
	"purchase_orders.read": [ "purchase_orders.view" ],
	"reports.read": [ "reports.view" ],
	"stores.read": [ "stores.view" ],
	"settings.read": [ "settings.view" ],
	"settings.manage_users": [
		"settings.users.view",
		"settings.users.create",
		"settings.users.update",
		"settings.users.suspend",
		"settings.users.assign_role",
		"settings.users.reset_password",
	],
	"settings.manage_roles": [
		"settings.roles.view",
		"settings.roles.create",
		"settings.roles.update",
		"settings.roles.archive",
	],
	"settings.manage_store": [
		"settings.store.view",
		"settings.store.create",
		"settings.store.update",
		"settings.store.archive",
	],
	"superadmin.manage": [
		"superadmin.view",
		"superadmin.users.view",
		"superadmin.users.create",
		"superadmin.users.update",
		"superadmin.users.archive",
		"superadmin.stores.view",
		"superadmin.stores.create",
		"superadmin.stores.update",
		"superadmin.stores.archive",
		"superadmin.roles.view",
		"superadmin.roles.create",
		"superadmin.roles.update",
		"superadmin.roles.archive",
	],
	"system_admin.manage": [
		"system_admin.dashboard.view",
		"system_admin.monitoring.view",
		"system_admin.security.view",
		"system_admin.clients.view",
		"system_admin.clients.create",
		"system_admin.clients.update",
		"system_admin.clients.delete",
		"system_admin.config.update",
	],
};

function getDbClient(preferredUrl) {
	const url = preferredUrl || process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:./database.db";
	const authToken = url.startsWith("file:") ? undefined : process.env.TURSO_AUTH_TOKEN;
	return {
		url,
		client: createClient({
		url,
		...(authToken ? { authToken } : {}),
		}),
	};
}

function uniqueSorted(values) {
	return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

async function hasColumn(db, tableName, columnName) {
	const pragma = await db.execute(`PRAGMA table_info(${tableName})`);
	const names = pragma.rows.map((row) => String(row.name || ""));
	return names.includes(columnName);
}

async function hasTable(db, tableName) {
	const result = await db.execute({
		sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
		args: [tableName],
	});
	return result.rows.length > 0;
}

async function loadRolePermissionRows(db) {
	const hasRolesTable = await hasTable(db, "roles");
	const hasRolePermissionsTable = await hasTable(db, "role_permissions");
	const hasPermissionsTable = await hasTable(db, "permissions");
	if (!hasRolesTable || !hasRolePermissionsTable || !hasPermissionsTable) {
		return [];
	}

	const hasDeletedAt = await hasColumn(db, "roles", "deleted_at");
	const whereClause = hasDeletedAt ? "WHERE r.deleted_at IS NULL" : "";

	const result = await db.execute(`
		SELECT
			r.id AS role_id,
			r.name AS role_name,
			r.store_id AS store_id,
			p.key AS permission_key
		FROM roles r
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		LEFT JOIN permissions p ON p.id = rp.permission_id
		${whereClause}
		ORDER BY r.store_id, r.name, p.key
	`);

	return result.rows.map((row) => ({
		roleId: String(row.role_id),
		roleName: String(row.role_name),
		storeId: String(row.store_id),
		permissionKey: row.permission_key ? String(row.permission_key) : null,
	}));
}

function computeCoverage(rows) {
	const roleMap = new Map();

	for (const row of rows) {
		const key = `${row.storeId}:${row.roleId}`;
		if (!roleMap.has(key)) {
			roleMap.set(key, {
				roleId: row.roleId,
				roleName: row.roleName,
				storeId: row.storeId,
				permissions: [],
				legacyPermissions: [],
				missingActionPermissions: [],
			});
		}

		if (row.permissionKey) {
			roleMap.get(key).permissions.push(row.permissionKey);
		}
	}

	for (const coverage of roleMap.values()) {
		const permissions = uniqueSorted(coverage.permissions);
		const legacyPermissions = permissions.filter((permissionKey) =>
			Object.prototype.hasOwnProperty.call(LEGACY_TO_ACTION_PERMISSION_MAP, permissionKey),
		);

		const missing = new Set();
		for (const legacyKey of legacyPermissions) {
			const recommended = LEGACY_TO_ACTION_PERMISSION_MAP[legacyKey] || [];
			for (const actionKey of recommended) {
				if (!permissions.includes(actionKey)) {
					missing.add(actionKey);
				}
			}
		}

		coverage.permissions = permissions;
		coverage.legacyPermissions = uniqueSorted(legacyPermissions);
		coverage.missingActionPermissions = uniqueSorted(Array.from(missing));
	}

	return Array.from(roleMap.values()).sort((left, right) => {
		if (left.storeId !== right.storeId) return left.storeId.localeCompare(right.storeId);
		return left.roleName.localeCompare(right.roleName);
	});
}

function printSummary(coverages) {
	const rolesWithLegacy = coverages.filter((role) => role.legacyPermissions.length > 0);
	const rolesWithMissingAction = coverages.filter((role) => role.missingActionPermissions.length > 0);

	console.log("=== Role Permission Coverage Report (v1) ===");
	console.log(`Total roles: ${coverages.length}`);
	console.log(`Roles with legacy permissions: ${rolesWithLegacy.length}`);
	console.log(`Roles missing suggested action permissions: ${rolesWithMissingAction.length}`);
	console.log("");

	if (!rolesWithLegacy.length) {
		console.log("No legacy permission usage found.");
		return;
	}

	for (const role of rolesWithLegacy) {
		console.log(`- Store: ${role.storeId}`);
		console.log(`  Role: ${role.roleName} (${role.roleId})`);
		console.log(`  Legacy: ${role.legacyPermissions.join(", ")}`);
		console.log(
			role.missingActionPermissions.length
				? `  Missing action keys: ${role.missingActionPermissions.join(", ")}`
				: "  Missing action keys: none",
		);
		console.log("");
	}
}

async function main() {
	const primary = getDbClient();
	let db = primary.client;
	let activeUrl = primary.url;

	try {
		await db.execute("SELECT 1 AS ok");
	} catch (error) {
		if (!activeUrl.startsWith("file:")) {
			console.warn(`[roles:coverage] primary database unreachable (${activeUrl}), fallback to file:./database.db`);
			const fallback = getDbClient("file:./database.db");
			db = fallback.client;
			activeUrl = fallback.url;
			await db.execute("SELECT 1 AS ok");
		} else {
			throw error;
		}
	}

	const rows = await loadRolePermissionRows(db);
	const coverages = computeCoverage(rows);
	console.log(`Database: ${activeUrl}`);
	printSummary(coverages);
}

main().catch((error) => {
	console.error("Failed to generate role permission coverage report");
	console.error(error);
	process.exitCode = 1;
});
