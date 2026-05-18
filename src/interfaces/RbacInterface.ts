import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";
import bcrypt from "bcryptjs";

import { AuthInterface } from "@interfaces/AuthInterface";
import { DbConn } from "@connections/DbConn";
import { StoreInterface } from "@interfaces/StoreInterface";
import { Permission } from "@models/Permission";
import { Role, RoleCreateInput, RoleUpdateInput } from "@models/Role";
import { resolveAcceptedPermissionKeys } from "@utils/PermissionCompat";

type RoleWithPermissions = Role & {
	permissions: Permission[];
	permissions_count: number;
};

type RoleSummary = Role & {
	permissions_count: number;
};

type UserAccessMembership = {
	store_id: string;
	role_id: string;
	role_name: string;
	status: string;
	permissions: Permission[];
};

type UserAccessSummary = {
	user_id: string;
	store_id?: string;
	permissions: Permission[];
	memberships: UserAccessMembership[];
};

type StoreMemberRoleAssignment = {
	store_id: string;
	user_id: string;
	role_id: string;
	status?: string;
	added_by?: string | null;
};

type StoreMemberListItem = {
	store_id: string;
	user_id: string;
	name: string;
	email: string;
	system_role: string;
	ui_locale: string;
	status: string;
	role_id: string;
	role_name: string;
	created_at: string;
	added_by: string | null;
	permissions_count: number;
	permissions: Permission[];
};

type StoreMemberCreateInput = {
	store_id: string;
	name: string;
	email: string;
	password: string;
	role_id?: string;
	status?: string;
	system_role?: string;
	ui_locale?: string;
	must_change_password?: boolean;
	added_by?: string | null;
};

type StoreMemberStatusUpdateInput = {
	store_id: string;
	user_id: string;
	status: string;
	added_by?: string | null;
};

type StoreMemberPasswordResetInput = {
	store_id: string;
	user_id: string;
	password: string;
	must_change_password?: boolean;
	actor_user_id?: string | null;
};

const DEFAULT_PERMISSION_SEED = [
	{ key: "pos.create_order", resource: "pos", action: "create_order" },
	{ key: "pos.apply_discount", resource: "pos", action: "apply_discount" },
	{ key: "pos.override_price", resource: "pos", action: "override_price" },
	{ key: "products.read", resource: "products", action: "read" },
	{ key: "products.view", resource: "products", action: "view" },
	{ key: "products.create", resource: "products", action: "create" },
	{ key: "products.update", resource: "products", action: "update" },
	{ key: "products.update_cost", resource: "products", action: "update_cost" },
	{ key: "products.deactivate", resource: "products", action: "deactivate" },
	{ key: "products.archive", resource: "products", action: "archive" },
	{ key: "inventory.read", resource: "inventory", action: "read" },
	{ key: "inventory.view", resource: "inventory", action: "view" },
	{ key: "inventory.adjust", resource: "inventory", action: "adjust" },
	{ key: "inventory.adjust_negative", resource: "inventory", action: "adjust_negative" },
	{ key: "activity.read", resource: "activity", action: "read" },
	{ key: "activity.view", resource: "activity", action: "view" },
	{ key: "stores.read", resource: "stores", action: "read" },
	{ key: "stores.view", resource: "stores", action: "view" },
	{ key: "stores.create", resource: "stores", action: "create" },
	{ key: "stores.update", resource: "stores", action: "update" },
	{ key: "stores.archive", resource: "stores", action: "archive" },
	{ key: "settings.read", resource: "settings", action: "read" },
	{ key: "purchase_orders.read", resource: "purchase_orders", action: "read" },
	{ key: "purchase_orders.view", resource: "purchase_orders", action: "view" },
	{ key: "purchase_orders.create", resource: "purchase_orders", action: "create" },
	{ key: "purchase_orders.update", resource: "purchase_orders", action: "update" },
	{ key: "purchase_orders.cancel", resource: "purchase_orders", action: "cancel" },
	{ key: "purchase_orders.receive", resource: "purchase_orders", action: "receive" },
	{ key: "reports.read", resource: "reports", action: "read" },
	{ key: "reports.view", resource: "reports", action: "view" },
	{ key: "reports.export", resource: "reports", action: "export" },
	{ key: "settings.manage_store", resource: "settings", action: "manage_store" },
	{ key: "settings.manage_users", resource: "settings", action: "manage_users" },
	{ key: "settings.manage_roles", resource: "settings", action: "manage_roles" },
	{ key: "settings.view", resource: "settings", action: "view" },
	{ key: "settings.store.view", resource: "settings.store", action: "view" },
	{ key: "settings.store.create", resource: "settings.store", action: "create" },
	{ key: "settings.store.update", resource: "settings.store", action: "update" },
	{ key: "settings.store.archive", resource: "settings.store", action: "archive" },
	{ key: "settings.users.view", resource: "settings.users", action: "view" },
	{ key: "settings.users.create", resource: "settings.users", action: "create" },
	{ key: "settings.users.update", resource: "settings.users", action: "update" },
	{ key: "settings.users.suspend", resource: "settings.users", action: "suspend" },
	{ key: "settings.users.assign_role", resource: "settings.users", action: "assign_role" },
	{ key: "settings.users.reset_password", resource: "settings.users", action: "reset_password" },
	{ key: "settings.roles.view", resource: "settings.roles", action: "view" },
	{ key: "settings.roles.create", resource: "settings.roles", action: "create" },
	{ key: "settings.roles.update", resource: "settings.roles", action: "update" },
	{ key: "settings.roles.archive", resource: "settings.roles", action: "archive" },
	{ key: "superadmin.manage", resource: "superadmin", action: "manage" },
	{ key: "superadmin.view", resource: "superadmin", action: "view" },
	{ key: "superadmin.users.view", resource: "superadmin.users", action: "view" },
	{ key: "superadmin.users.create", resource: "superadmin.users", action: "create" },
	{ key: "superadmin.users.update", resource: "superadmin.users", action: "update" },
	{ key: "superadmin.users.archive", resource: "superadmin.users", action: "archive" },
	{ key: "superadmin.stores.view", resource: "superadmin.stores", action: "view" },
	{ key: "superadmin.stores.create", resource: "superadmin.stores", action: "create" },
	{ key: "superadmin.stores.update", resource: "superadmin.stores", action: "update" },
	{ key: "superadmin.stores.archive", resource: "superadmin.stores", action: "archive" },
	{ key: "superadmin.roles.view", resource: "superadmin.roles", action: "view" },
	{ key: "superadmin.roles.create", resource: "superadmin.roles", action: "create" },
	{ key: "superadmin.roles.update", resource: "superadmin.roles", action: "update" },
	{ key: "superadmin.roles.archive", resource: "superadmin.roles", action: "archive" },
	{ key: "system_admin.manage", resource: "system_admin", action: "manage" },
	{ key: "system_admin.dashboard.view", resource: "system_admin.dashboard", action: "view" },
	{ key: "system_admin.monitoring.view", resource: "system_admin.monitoring", action: "view" },
	{ key: "system_admin.security.view", resource: "system_admin.security", action: "view" },
	{ key: "system_admin.clients.view", resource: "system_admin.clients", action: "view" },
	{ key: "system_admin.clients.create", resource: "system_admin.clients", action: "create" },
	{ key: "system_admin.clients.update", resource: "system_admin.clients", action: "update" },
	{ key: "system_admin.clients.delete", resource: "system_admin.clients", action: "delete" },
	{ key: "system_admin.config.update", resource: "system_admin.config", action: "update" },
] as const;

const DEFAULT_STORE_MEMBER_ROLE_NAME = "Cashier";
const DEFAULT_STORE_OWNER_ROLE_NAME = "Owner";

const DEFAULT_STORE_ROLE_PRESETS: ReadonlyArray<{
	name: string;
	permissionKeys: readonly string[];
}> = [
	{
		name: "Owner",
		permissionKeys: [
			"pos.create_order",
			"pos.apply_discount",
			"pos.override_price",
			"products.view",
			"products.create",
			"products.update",
			"products.update_cost",
			"products.archive",
			"inventory.view",
			"inventory.adjust",
			"inventory.adjust_negative",
			"purchase_orders.view",
			"purchase_orders.create",
			"purchase_orders.update",
			"purchase_orders.cancel",
			"purchase_orders.receive",
			"reports.view",
			"reports.export",
			"activity.view",
			"stores.view",
			"stores.update",
			"settings.view",
			"settings.store.view",
			"settings.store.update",
			"settings.users.view",
			"settings.users.create",
			"settings.users.update",
			"settings.users.suspend",
			"settings.users.assign_role",
			"settings.users.reset_password",
			"settings.roles.view",
			"settings.roles.create",
			"settings.roles.update",
			"settings.roles.archive",
		],
	},
	{
		name: "Manager",
		permissionKeys: [
			"pos.create_order",
			"pos.apply_discount",
			"products.view",
			"products.create",
			"products.update",
			"inventory.view",
			"inventory.adjust",
			"inventory.adjust_negative",
			"purchase_orders.view",
			"purchase_orders.create",
			"purchase_orders.update",
			"purchase_orders.receive",
			"reports.view",
			"reports.export",
			"activity.view",
			"settings.view",
			"settings.users.view",
			"settings.users.create",
			"settings.users.update",
			"settings.users.suspend",
			"settings.users.assign_role",
		],
	},
	{
		name: "Cashier",
		permissionKeys: [
			"pos.create_order",
			"pos.apply_discount",
			"products.view",
			"inventory.view",
			"purchase_orders.view",
		],
	},
	{
		name: "Inventory Staff",
		permissionKeys: [
			"products.view",
			"inventory.view",
			"inventory.adjust",
			"purchase_orders.view",
			"purchase_orders.create",
			"purchase_orders.receive",
		],
	},
	{
		name: "Viewer",
		permissionKeys: [
			"products.view",
			"inventory.view",
			"purchase_orders.view",
			"reports.view",
			"stores.view",
			"settings.view",
			"activity.view",
		],
	},
] as const;

function normalizeRoleName(value: string): string {
	return value.trim().toLowerCase();
}

function mapPermissionRow(row: Record<string, unknown>): Permission {
	return {
		id: String(row.id),
		key: String(row.key),
		resource: String(row.resource),
		action: String(row.action),
	};
}

function mapRoleRow(row: Record<string, unknown>): Role {
	return {
		id: String(row.id),
		store_id: String(row.store_id),
		name: String(row.name),
		is_system: Number(row.is_system || 0),
		created_at: String(row.created_at),
		deleted_at: row.deleted_at ? String(row.deleted_at) : null,
	};
}

function getUpdatePayload(data: RoleUpdateInput): Record<string, InValue> {
	const result: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(data)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

export class RbacInterface {
	private static roleColumnsEnsured = false;
	private static ensureRoleColumnsPromise: Promise<void> | null = null;
	private static defaultRolesReadyByStore = new Set<string>();
	private static ensureDefaultRolesPromiseByStore = new Map<string, Promise<void>>();
	private static permissionSeedEnsured = false;
	private static ensurePermissionSeedPromise: Promise<void> | null = null;

	private static async ensureRoleColumns(): Promise<void> {
		if (RbacInterface.roleColumnsEnsured) return;
		if (RbacInterface.ensureRoleColumnsPromise) {
			return RbacInterface.ensureRoleColumnsPromise;
		}

		RbacInterface.ensureRoleColumnsPromise = (async () => {
			const db = DbConn.getClient();
			const pragmaResult = await db.execute("PRAGMA table_info(roles)");
			const existingColumns = new Set(
				pragmaResult.rows.map((row) => String(row.name || "")),
			);

			if (!existingColumns.has("deleted_at")) {
				await db.execute("ALTER TABLE roles ADD COLUMN deleted_at TEXT");
			}

			RbacInterface.roleColumnsEnsured = true;
		})().catch((error) => {
			RbacInterface.ensureRoleColumnsPromise = null;
			throw error;
		});

		return RbacInterface.ensureRoleColumnsPromise;
	}

	private static async ensureTables(): Promise<void> {
		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS permissions (
				id TEXT PRIMARY KEY,
				key TEXT NOT NULL UNIQUE,
				resource TEXT NOT NULL,
				action TEXT NOT NULL
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS roles (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				name TEXT NOT NULL,
				is_system INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				deleted_at TEXT
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS role_permissions (
				role_id TEXT NOT NULL,
				permission_id TEXT NOT NULL,
				PRIMARY KEY (role_id, permission_id)
			)
		`);
		await db.execute("CREATE INDEX IF NOT EXISTS idx_roles_store_deleted ON roles(store_id, deleted_at, is_system, name, created_at)");

		await db.execute(`
			CREATE TABLE IF NOT EXISTS store_members (
				store_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				role_id TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'active',
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				added_by TEXT,
				PRIMARY KEY (store_id, user_id)
			)
		`);

		await RbacInterface.ensureRoleColumns();
	}

	private static async ensurePermissionSeed(): Promise<void> {
		if (RbacInterface.permissionSeedEnsured) return;
		if (RbacInterface.ensurePermissionSeedPromise) {
			return RbacInterface.ensurePermissionSeedPromise;
		}

		RbacInterface.ensurePermissionSeedPromise = (async () => {
			await RbacInterface.ensureTables();
			const db = DbConn.getClient();
			const existingResult = await db.execute("SELECT key, resource, action FROM permissions");
			const existingKeys = new Set(existingResult.rows.map((row) => String(row.key || "")));
			const existingResourceActions = new Set(
				existingResult.rows.map((row) => `${String(row.resource || "")}::${String(row.action || "")}`),
			);

			for (const permission of DEFAULT_PERMISSION_SEED) {
				if (existingKeys.has(permission.key)) continue;
				const resourceActionKey = `${permission.resource}::${permission.action}`;
				// Backward compatibility:
				// Some existing deployments still keep UNIQUE(resource, action).
				// In that schema, legacy/new alias keys for the same action pair cannot coexist.
				if (existingResourceActions.has(resourceActionKey)) continue;
				await db.execute({
					sql: `
						INSERT INTO permissions (id, key, resource, action)
						VALUES (?, ?, ?, ?)
					`,
					args: [ randomUUID(), permission.key, permission.resource, permission.action ],
				});
				existingKeys.add(permission.key);
				existingResourceActions.add(resourceActionKey);
			}
			RbacInterface.permissionSeedEnsured = true;
		})().catch((error) => {
			RbacInterface.ensurePermissionSeedPromise = null;
			throw error;
		});

		return RbacInterface.ensurePermissionSeedPromise;
	}

	static async listPermissions(): Promise<Permission[]> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const result = await db.execute("SELECT * FROM permissions ORDER BY resource, action, key");
		return result.rows.map((row) => mapPermissionRow(row));
	}

	static async listRoles(storeId?: string): Promise<RoleWithPermissions[]> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const args: InValue[] = [];
		let sql = `
			SELECT
				r.id AS role_id,
				r.store_id AS role_store_id,
				r.name AS role_name,
				r.is_system AS role_is_system,
				r.created_at AS role_created_at,
				r.deleted_at AS role_deleted_at,
				p.id AS permission_id,
				p.key AS permission_key,
				p.resource AS permission_resource,
				p.action AS permission_action
			FROM roles r
			LEFT JOIN role_permissions rp ON rp.role_id = r.id
			LEFT JOIN permissions p ON p.id = rp.permission_id
			WHERE r.deleted_at IS NULL
		`;

		if (storeId) {
			sql += " AND r.store_id = ?";
			args.push(storeId);
		}

		sql += " ORDER BY r.is_system DESC, r.name ASC, r.created_at DESC, p.resource, p.action, p.key";
		const result = await db.execute({ sql, args });
		const roleMap = new Map<string, RoleWithPermissions>();
		for (const row of result.rows) {
			const roleId = String(row.role_id || "");
			if (!roleId) continue;

			if (!roleMap.has(roleId)) {
				roleMap.set(roleId, {
					id: roleId,
					store_id: String(row.role_store_id || ""),
					name: String(row.role_name || ""),
					is_system: Number(row.role_is_system || 0),
					created_at: String(row.role_created_at || new Date(0).toISOString()),
					deleted_at: row.role_deleted_at ? String(row.role_deleted_at) : null,
					permissions: [],
					permissions_count: 0,
				});
			}

			if (row.permission_id) {
				const role = roleMap.get(roleId);
				if (!role) continue;
				const permission: Permission = {
					id: String(row.permission_id),
					key: String(row.permission_key),
					resource: String(row.permission_resource),
					action: String(row.permission_action),
				};
				if (!role.permissions.some((existingPermission) => existingPermission.id === permission.id)) {
					role.permissions.push(permission);
					role.permissions_count = role.permissions.length;
				}
			}
		}

		return Array.from(roleMap.values());
	}

	static async listRoleSummaries(storeId?: string): Promise<RoleSummary[]> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const args: InValue[] = [];
		let sql = `
			SELECT
				r.id AS role_id,
				r.store_id AS role_store_id,
				r.name AS role_name,
				r.is_system AS role_is_system,
				r.created_at AS role_created_at,
				r.deleted_at AS role_deleted_at,
				COUNT(rp.permission_id) AS permissions_count
			FROM roles r
			LEFT JOIN role_permissions rp ON rp.role_id = r.id
			WHERE r.deleted_at IS NULL
		`;

		if (storeId) {
			sql += " AND r.store_id = ?";
			args.push(storeId);
		}

		sql += `
			GROUP BY r.id, r.store_id, r.name, r.is_system, r.created_at, r.deleted_at
			ORDER BY r.is_system DESC, r.name ASC, r.created_at DESC
		`;

		const result = await db.execute({ sql, args });
		return result.rows.map((row) => ({
			id: String(row.role_id || ""),
			store_id: String(row.role_store_id || ""),
			name: String(row.role_name || ""),
			is_system: Number(row.role_is_system || 0),
			created_at: String(row.role_created_at || new Date(0).toISOString()),
			deleted_at: row.role_deleted_at ? String(row.role_deleted_at) : null,
			permissions_count: Number(row.permissions_count || 0),
		}));
	}

	static async getRoleById(id: string): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		const role = mapRoleRow(result.rows[0]);
		const permissions = await RbacInterface.getPermissionsByRoleId(role.id);
		return {
			...role,
			permissions,
			permissions_count: permissions.length,
		};
	}

	static async createRole(
		payload: RoleCreateInput,
		permissionKeys?: string[],
	): Promise<RoleWithPermissions> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const roleId = payload.id || randomUUID();
		const createdAt = payload.created_at || new Date().toISOString();

		await db.execute({
			sql: `
				INSERT INTO roles (id, store_id, name, is_system, created_at)
				VALUES (?, ?, ?, ?, ?)
			`,
			args: [
				roleId,
				payload.store_id,
				payload.name,
				payload.is_system ?? 0,
				createdAt,
			],
		});

		if (permissionKeys && permissionKeys.length > 0) {
			await RbacInterface.replaceRolePermissionsByKeys(roleId, permissionKeys);
		}

		const role = await RbacInterface.getRoleById(roleId);
		if (!role) throw new Error("Failed to create role");
		return role;
	}

	static async duplicateRole(
		id: string,
		name: string,
		permissionKeysOverride?: string[],
	): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const role = await RbacInterface.getRoleById(id);
		if (!role) return null;
		const permissionKeys = permissionKeysOverride ?? role.permissions.map((permission) => permission.key);

		return RbacInterface.createRole({
			store_id: role.store_id,
			name,
			is_system: 0,
		}, permissionKeys);
	}

	static async applyRoleToStore(
		id: string,
		payload: { target_store_id: string; mode: "create" | "update"; name?: string | null; target_role_id?: string | null },
		permissionKeysOverride?: string[],
	): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const sourceRole = await RbacInterface.getRoleById(id);
		if (!sourceRole) return null;

		const permissionKeys = permissionKeysOverride ?? sourceRole.permissions.map((permission) => permission.key);

		if (payload.mode === "update") {
			const targetRoleId = String(payload.target_role_id || "").trim();
			if (!targetRoleId) {
				throw new Error("ROLE_NOT_FOUND");
			}
			const targetRole = await RbacInterface.getRoleById(targetRoleId);
			if (!targetRole || targetRole.store_id !== payload.target_store_id) {
				throw new Error("ROLE_NOT_FOUND");
			}
			return RbacInterface.updateRole(targetRole.id, {}, permissionKeys);
		}

		const nextName = String(payload.name || "").trim();
		if (!nextName) {
			throw new Error("ROLE_NAME_REQUIRED");
		}

		return RbacInterface.createRole({
			store_id: payload.target_store_id,
			name: nextName,
			is_system: 0,
		}, permissionKeys);
	}

	static async ensureDefaultRolePresetsForStore(storeId: string): Promise<void> {
		if (RbacInterface.defaultRolesReadyByStore.has(storeId)) {
			return;
		}
		const inFlight = RbacInterface.ensureDefaultRolesPromiseByStore.get(storeId);
		if (inFlight) return inFlight;

		const runner = (async () => {
			await RbacInterface.ensurePermissionSeed();
			const db = DbConn.getClient();
			const existingResult = await db.execute({
				sql: `
					SELECT id, name, is_system
					FROM roles
					WHERE store_id = ? AND deleted_at IS NULL
				`,
				args: [ storeId ],
			});
			const rolesByName = new Map(
				existingResult.rows.map((row) => [
					normalizeRoleName(String(row.name || "")),
					{
						id: String(row.id || ""),
						name: String(row.name || ""),
						is_system: Number(row.is_system || 0),
					},
				]),
			);
			const missingPresets = DEFAULT_STORE_ROLE_PRESETS.filter((preset) => !rolesByName.has(normalizeRoleName(preset.name)));
			if (missingPresets.length === 0) {
				RbacInterface.defaultRolesReadyByStore.add(storeId);
				return;
			}

			const availablePermissionMap = await RbacInterface.getAvailablePermissionKeyMap();

			// Backfill new permissions into existing system presets without removing custom permissions.
			for (const preset of DEFAULT_STORE_ROLE_PRESETS) {
				const existing = rolesByName.get(normalizeRoleName(preset.name));
				if (!existing || existing.is_system !== 1) continue;
				const compatiblePresetKeys = RbacInterface.resolveCompatiblePermissionKeys(
					preset.permissionKeys,
					availablePermissionMap,
				);
				if (compatiblePresetKeys.length === 0) continue;
				await RbacInterface.addRolePermissionsByKeys(existing.id, compatiblePresetKeys);
			}

			for (const preset of missingPresets) {
				const compatiblePresetKeys = RbacInterface.resolveCompatiblePermissionKeys(
					preset.permissionKeys,
					availablePermissionMap,
				);
				if (compatiblePresetKeys.length === 0) continue;

				const created = await RbacInterface.createRole({
					store_id: storeId,
					name: preset.name,
					is_system: 1,
				}, compatiblePresetKeys);
				rolesByName.set(normalizeRoleName(created.name), {
					id: created.id,
					name: created.name,
					is_system: Number(created.is_system || 0),
				});
			}

			RbacInterface.defaultRolesReadyByStore.add(storeId);
		})().finally(() => {
			RbacInterface.ensureDefaultRolesPromiseByStore.delete(storeId);
		});

		RbacInterface.ensureDefaultRolesPromiseByStore.set(storeId, runner);
		return runner;
	}

	static async ensureDefaultRolesForStore(storeId: string): Promise<RoleWithPermissions[]> {
		await RbacInterface.ensureDefaultRolePresetsForStore(storeId);
		return RbacInterface.listRoles(storeId);
	}

	static async resolveStoreMemberRoleId(storeId: string, roleId?: string): Promise<string> {
		await RbacInterface.ensurePermissionSeed();

		if (roleId?.trim()) {
			const role = await RbacInterface.getRoleById(roleId.trim());
			if (!role || role.store_id !== storeId) {
				throw new Error("ROLE_NOT_FOUND");
			}
			return role.id;
		}

		let roles = await RbacInterface.listRoles(storeId);
		if (!roles.length) {
			roles = await RbacInterface.ensureDefaultRolesForStore(storeId);
		}

		const defaultRole = (
			roles.find((role) => Number(role.is_system || 0) === 1 && normalizeRoleName(role.name) === normalizeRoleName(DEFAULT_STORE_MEMBER_ROLE_NAME))
			|| roles.find((role) => normalizeRoleName(role.name) === normalizeRoleName(DEFAULT_STORE_MEMBER_ROLE_NAME))
			|| roles.find((role) => Number(role.is_system || 0) === 1)
			|| roles[0]
		);

		if (!defaultRole) {
			throw new Error("ROLE_NOT_FOUND");
		}

		return defaultRole.id;
	}

	static async resolveStoreOwnerRoleId(storeId: string): Promise<string> {
		await RbacInterface.ensurePermissionSeed();

		let roles = await RbacInterface.listRoles(storeId);
		if (!roles.length) {
			roles = await RbacInterface.ensureDefaultRolesForStore(storeId);
		}

		const ownerRole = (
			roles.find((role) => Number(role.is_system || 0) === 1 && normalizeRoleName(role.name) === normalizeRoleName(DEFAULT_STORE_OWNER_ROLE_NAME))
			|| roles.find((role) => normalizeRoleName(role.name) === normalizeRoleName(DEFAULT_STORE_OWNER_ROLE_NAME))
			|| roles.find((role) => Number(role.is_system || 0) === 1)
			|| roles[0]
		);

		if (!ownerRole) {
			throw new Error("ROLE_NOT_FOUND");
		}

		return ownerRole.id;
	}

	static async ensureOwnerMembershipForStore(storeId: string, userId: string): Promise<void> {
		await RbacInterface.ensurePermissionSeed();
		const ownerRoleId = await RbacInterface.resolveStoreOwnerRoleId(storeId);
		await RbacInterface.assignStoreMemberRole({
			store_id: storeId,
			user_id: userId,
			role_id: ownerRoleId,
			status: "active",
			added_by: userId,
		});
	}

	static async ensureOwnerMemberships(userId: string): Promise<void> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const missingMembershipStores = await db.execute({
			sql: `
				SELECT s.id
				FROM stores s
				LEFT JOIN store_members sm
					ON sm.store_id = s.id
					AND sm.user_id = ?
				WHERE s.owner_user_id = ?
					AND sm.user_id IS NULL
				ORDER BY s.created_at DESC
			`,
			args: [ userId, userId ],
		});

		for (const row of missingMembershipStores.rows) {
			const storeId = String(row.id || "");
			if (!storeId) continue;
			await RbacInterface.ensureOwnerMembershipForStore(storeId, userId);
		}
	}

	static async updateRole(
		id: string,
		data: RoleUpdateInput,
		permissionKeys?: string[],
	): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const updatePayload = getUpdatePayload(data);
		const keys = Object.keys(updatePayload);

		if (keys.length > 0) {
			const setClause = keys.map((key) => `${key} = ?`).join(", ");
			await db.execute({
				sql: `UPDATE roles SET ${setClause} WHERE id = ?`,
				args: [ ...Object.values(updatePayload), id ],
			});
		}

		if (permissionKeys) {
			await RbacInterface.replaceRolePermissionsByKeys(id, permissionKeys);
		}

		return RbacInterface.getRoleById(id);
	}

	static async getUserPermissions(userId: string, storeId?: string): Promise<UserAccessSummary> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const scopedWhere: string[] = [ "sm.user_id = ?" ];
		const scopedArgs: InValue[] = [ userId ];

		if (storeId) {
			scopedWhere.push("sm.store_id = ?");
			scopedArgs.push(storeId);
		}

		const membershipsResult = await db.execute({
			sql: `
				SELECT
					sm.store_id,
					sm.user_id,
					sm.role_id,
					sm.status,
					r.name AS role_name,
					p.id AS permission_id,
					p.key AS permission_key,
					p.resource AS permission_resource,
					p.action AS permission_action
				FROM store_members sm
				INNER JOIN roles r ON r.id = sm.role_id AND r.deleted_at IS NULL
				LEFT JOIN role_permissions rp ON rp.role_id = r.id
				LEFT JOIN permissions p ON p.id = rp.permission_id
				WHERE sm.user_id = ?
				ORDER BY sm.store_id, r.name, p.resource, p.action, p.key
			`,
			args: [ userId ],
		});

		const scopedPermissionsResult = await db.execute({
			sql: `
				SELECT
					sm.store_id,
					sm.user_id,
					sm.role_id,
					sm.status,
					r.name AS role_name,
					p.id AS permission_id,
					p.key AS permission_key,
					p.resource AS permission_resource,
					p.action AS permission_action
				FROM store_members sm
				INNER JOIN roles r ON r.id = sm.role_id AND r.deleted_at IS NULL
				LEFT JOIN role_permissions rp ON rp.role_id = r.id
				LEFT JOIN permissions p ON p.id = rp.permission_id
				WHERE ${scopedWhere.join(" AND ")}
				ORDER BY sm.store_id, r.name, p.resource, p.action, p.key
			`,
			args: scopedArgs,
		});

		const membershipMap = new Map<string, UserAccessMembership>();
		const permissionMap = new Map<string, Permission>();

		for (const row of membershipsResult.rows) {
			const storeKey = String(row.store_id);
			const membershipKey = `${storeKey}:${String(row.role_id)}`;
			if (!membershipMap.has(membershipKey)) {
				membershipMap.set(membershipKey, {
					store_id: storeKey,
					role_id: String(row.role_id),
					role_name: String(row.role_name),
					status: String(row.status),
					permissions: [],
				});
			}
		}

		for (const row of scopedPermissionsResult.rows) {
			const storeKey = String(row.store_id);
			const membershipKey = `${storeKey}:${String(row.role_id)}`;
			if (row.permission_id) {
				const permission = {
					id: String(row.permission_id),
					key: String(row.permission_key),
					resource: String(row.permission_resource),
					action: String(row.permission_action),
				};

				const existingMembership = membershipMap.get(membershipKey);
				if (existingMembership && !existingMembership.permissions.some((item) => item.id === permission.id)) {
					existingMembership.permissions.push(permission);
				}

				if (!permissionMap.has(permission.id)) {
					permissionMap.set(permission.id, permission);
				}
			}
		}

		return {
			user_id: userId,
			store_id: storeId,
			permissions: Array.from(permissionMap.values()),
			memberships: Array.from(membershipMap.values()),
		};
	}

	static async assignStoreMemberRole(payload: StoreMemberRoleAssignment): Promise<UserAccessSummary> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		await db.execute({
			sql: `
				INSERT INTO store_members (store_id, user_id, role_id, status, created_at, added_by)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(store_id, user_id) DO UPDATE SET
					role_id = excluded.role_id,
					status = excluded.status,
					added_by = excluded.added_by
			`,
			args: [
				payload.store_id,
				payload.user_id,
				payload.role_id,
				payload.status || "active",
				new Date().toISOString(),
				payload.added_by || null,
			],
		});

		return RbacInterface.getUserPermissions(payload.user_id, payload.store_id);
	}

	static async listStoreMembers(params: {
		store_id: string;
		search?: string;
		status?: string;
		role_id?: string;
	}): Promise<StoreMemberListItem[]> {
		await RbacInterface.ensurePermissionSeed();
		await AuthInterface.ensureUserAuthColumns();
		const db = DbConn.getClient();
		const where = [ "sm.store_id = ?" ];
		const args: InValue[] = [ params.store_id ];

		if (params.status) {
			where.push("sm.status = ?");
			args.push(params.status);
		}

		if (params.role_id) {
			where.push("sm.role_id = ?");
			args.push(params.role_id);
		}

		if (params.search?.trim()) {
			where.push("(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)");
			const keyword = `%${params.search.trim().toLowerCase()}%`;
			args.push(keyword, keyword);
		}

		const result = await db.execute({
			sql: `
				SELECT
					sm.store_id,
					sm.user_id,
					sm.role_id,
					sm.status,
					sm.created_at,
					sm.added_by,
					u.name,
					u.email,
					u.system_role,
					u.ui_locale,
					r.name AS role_name,
					p.id AS permission_id,
					p.key AS permission_key,
					p.resource AS permission_resource,
					p.action AS permission_action
				FROM store_members sm
				INNER JOIN users u ON u.id = sm.user_id
				INNER JOIN roles r ON r.id = sm.role_id AND r.deleted_at IS NULL
				LEFT JOIN role_permissions rp ON rp.role_id = r.id
				LEFT JOIN permissions p ON p.id = rp.permission_id
				WHERE ${where.join(" AND ")}
				ORDER BY sm.created_at DESC, u.name ASC, p.resource, p.action, p.key
			`,
			args,
		});

		const items = new Map<string, StoreMemberListItem>();
		for (const row of result.rows) {
			const membershipKey = `${String(row.store_id)}:${String(row.user_id)}`;
			if (!items.has(membershipKey)) {
				items.set(membershipKey, {
					store_id: String(row.store_id),
					user_id: String(row.user_id),
					name: String(row.name),
					email: String(row.email),
					system_role: String(row.system_role || "staff"),
					ui_locale: String(row.ui_locale || "th"),
					status: String(row.status),
					role_id: String(row.role_id),
					role_name: String(row.role_name),
					created_at: String(row.created_at),
					added_by: row.added_by ? String(row.added_by) : null,
					permissions_count: 0,
					permissions: [],
				});
			}

			if (row.permission_id) {
				const permission = {
					id: String(row.permission_id),
					key: String(row.permission_key),
					resource: String(row.permission_resource),
					action: String(row.permission_action),
				};
				const item = items.get(membershipKey);
				if (item && !item.permissions.some((existing) => existing.id === permission.id)) {
					item.permissions.push(permission);
					item.permissions_count = item.permissions.length;
				}
			}
		}

		return Array.from(items.values());
	}

	static async createStoreMember(payload: StoreMemberCreateInput): Promise<StoreMemberListItem> {
		await RbacInterface.ensurePermissionSeed();
		await AuthInterface.ensureUserAuthColumns();
		const db = DbConn.getClient();
		const normalizedEmail = payload.email.trim().toLowerCase();
		const existingUser = await db.execute({
			sql: "SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1",
			args: [ normalizedEmail ],
		});

		let userId: string;
		if (existingUser.rows.length > 0) {
			userId = String(existingUser.rows[0].id);
		} else {
			const passwordHash = await bcrypt.hash(payload.password, 10);
			const now = new Date().toISOString();
			userId = randomUUID();
			const insertResult = await db.execute({
				sql: `
					INSERT INTO users (
						id, email, name, password_hash, created_at, session_limit, system_role,
						created_by, must_change_password, password_updated_at, ui_locale, client_suspended
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				args: [
					userId,
					normalizedEmail,
					payload.name.trim(),
					passwordHash,
					now,
					null,
					payload.system_role?.trim() || "staff",
					payload.added_by || null,
					payload.must_change_password ? 1 : 0,
					now,
					payload.ui_locale?.trim() || "th",
					0,
				],
			});
			void insertResult;
		}

		const resolvedRoleId = await RbacInterface.resolveStoreMemberRoleId(payload.store_id, payload.role_id);
		await RbacInterface.assignStoreMemberRole({
			store_id: payload.store_id,
			user_id: userId,
			role_id: resolvedRoleId,
			status: payload.status,
			added_by: payload.added_by,
		});

		const member = await RbacInterface.getStoreMemberById(payload.store_id, userId);
		if (!member) {
			throw new Error("Failed to create store member");
		}
		return member;
	}

	static async updateStoreMemberStatus(payload: StoreMemberStatusUpdateInput): Promise<StoreMemberListItem | null> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		await db.execute({
			sql: `
				UPDATE store_members
				SET status = ?, added_by = ?
				WHERE store_id = ? AND user_id = ?
			`,
			args: [
				payload.status,
				payload.added_by || null,
				payload.store_id,
				payload.user_id,
			],
		});

		return RbacInterface.getStoreMemberById(payload.store_id, payload.user_id);
	}

	static async getStoreMemberById(storeId: string, userId: string): Promise<StoreMemberListItem | null> {
		const members = await RbacInterface.listStoreMembers({
			store_id: storeId,
		});
		return members.find((member) => member.user_id === userId) || null;
	}

	static async resetStoreMemberPassword(payload: StoreMemberPasswordResetInput): Promise<StoreMemberListItem | null> {
		await RbacInterface.ensurePermissionSeed();
		await AuthInterface.ensureUserAuthColumns();
		const db = DbConn.getClient();
		const passwordHash = await bcrypt.hash(payload.password, 10);
		await db.execute({
			sql: `
				UPDATE users
				SET
					password_hash = ?,
					must_change_password = ?,
					password_updated_at = ?
				WHERE id = ?
			`,
			args: [
				passwordHash,
				payload.must_change_password ? 1 : 0,
				new Date().toISOString(),
				payload.user_id,
			],
		});

		return RbacInterface.getStoreMemberById(payload.store_id, payload.user_id);
	}

	static async softDeleteRole(id: string): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const role = await RbacInterface.getRoleById(id);
		if (!role) return null;

		const assignedResult = await db.execute({
			sql: "SELECT COUNT(*) AS total FROM store_members WHERE role_id = ?",
			args: [ id ],
		});
		const assignedTotal = Number(assignedResult.rows[0]?.total || 0);
		if (assignedTotal > 0) {
			throw new Error("ROLE_DELETE_BLOCKED");
		}

		await db.execute({
			sql: "UPDATE roles SET deleted_at = ? WHERE id = ?",
			args: [ new Date().toISOString(), id ],
		});

		return role;
	}

	private static async getPermissionsByRoleId(roleId: string): Promise<Permission[]> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT p.*
				FROM role_permissions rp
				INNER JOIN permissions p ON p.id = rp.permission_id
				WHERE rp.role_id = ?
				ORDER BY p.resource, p.action, p.key
			`,
			args: [ roleId ],
		});

		return result.rows.map((row) => mapPermissionRow(row));
	}

	private static async replaceRolePermissionsByKeys(roleId: string, permissionKeys: string[]): Promise<void> {
		const db = DbConn.getClient();
		const normalizedKeys = Array.from(new Set(permissionKeys.map((key) => key.trim()).filter(Boolean)));

		await db.execute({
			sql: "DELETE FROM role_permissions WHERE role_id = ?",
			args: [ roleId ],
		});

		if (normalizedKeys.length === 0) return;

		const placeholders = normalizedKeys.map(() => "?").join(", ");
		const permissionResult = await db.execute({
			sql: `SELECT * FROM permissions WHERE key IN (${placeholders})`,
			args: normalizedKeys,
		});

		const permissions = permissionResult.rows.map((row) => mapPermissionRow(row));
		const foundKeys = new Set(permissions.map((permission) => permission.key));
		const missingKeys = normalizedKeys.filter((key) => !foundKeys.has(key));
		if (missingKeys.length > 0) {
			throw new Error(`Permissions not found: ${missingKeys.join(", ")}`);
		}

		const valuePlaceholders = permissions.map(() => "(?, ?)").join(", ");
		const insertArgs: InValue[] = permissions.flatMap((permission) => [ roleId, permission.id ]);
		await db.execute({
			sql: `
				INSERT INTO role_permissions (role_id, permission_id)
				VALUES ${valuePlaceholders}
			`,
			args: insertArgs,
		});
	}

	private static async addRolePermissionsByKeys(roleId: string, permissionKeys: string[]): Promise<void> {
		const db = DbConn.getClient();
		const normalizedKeys = Array.from(new Set(permissionKeys.map((key) => key.trim()).filter(Boolean)));
		if (normalizedKeys.length === 0) return;

		const placeholders = normalizedKeys.map(() => "?").join(", ");
		const permissionResult = await db.execute({
			sql: `SELECT * FROM permissions WHERE key IN (${placeholders})`,
			args: normalizedKeys,
		});

		const permissions = permissionResult.rows.map((row) => mapPermissionRow(row));
		if (permissions.length === 0) return;

		const valuePlaceholders = permissions.map(() => "(?, ?)").join(", ");
		const insertArgs: InValue[] = permissions.flatMap((permission) => [ roleId, permission.id ]);
		await db.execute({
			sql: `
				INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
				VALUES ${valuePlaceholders}
			`,
			args: insertArgs,
		});
	}

	private static async getAvailablePermissionKeyMap(): Promise<Map<string, string>> {
		const permissions = await RbacInterface.listPermissions();
		const keyMap = new Map<string, string>();
		for (const permission of permissions) {
			keyMap.set(permission.key, permission.key);
		}
		return keyMap;
	}

	private static resolveCompatiblePermissionKeys(
		permissionKeys: readonly string[],
		availablePermissionMap: Map<string, string>,
	): string[] {
		const resolved = new Set<string>();
		for (const permissionKey of permissionKeys) {
			const acceptedKeys = resolveAcceptedPermissionKeys(permissionKey);
			const match = acceptedKeys.find((candidateKey) => availablePermissionMap.has(candidateKey));
			if (match) {
				resolved.add(match);
			}
		}
		return [ ...resolved ];
	}
}

export type {
	RoleSummary,
	RoleWithPermissions,
	StoreMemberCreateInput,
	StoreMemberListItem,
	StoreMemberPasswordResetInput,
	StoreMemberStatusUpdateInput,
	UserAccessSummary,
};
