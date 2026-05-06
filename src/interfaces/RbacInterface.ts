import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { Permission } from "@models/Permission";
import { Role, RoleCreateInput, RoleUpdateInput } from "@models/Role";

type RoleWithPermissions = Role & {
	permissions: Permission[];
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

const DEFAULT_PERMISSION_SEED = [
	{ key: "pos.create_order", resource: "pos", action: "create_order" },
	{ key: "pos.apply_discount", resource: "pos", action: "apply_discount" },
	{ key: "pos.override_price", resource: "pos", action: "override_price" },
	{ key: "products.read", resource: "products", action: "read" },
	{ key: "products.create", resource: "products", action: "create" },
	{ key: "products.update", resource: "products", action: "update" },
	{ key: "products.update_cost", resource: "products", action: "update_cost" },
	{ key: "products.deactivate", resource: "products", action: "deactivate" },
	{ key: "inventory.read", resource: "inventory", action: "read" },
	{ key: "inventory.adjust", resource: "inventory", action: "adjust" },
	{ key: "activity.read", resource: "activity", action: "read" },
	{ key: "stores.read", resource: "stores", action: "read" },
	{ key: "settings.read", resource: "settings", action: "read" },
	{ key: "purchase_orders.read", resource: "purchase_orders", action: "read" },
	{ key: "purchase_orders.create", resource: "purchase_orders", action: "create" },
	{ key: "purchase_orders.receive", resource: "purchase_orders", action: "receive" },
	{ key: "reports.read", resource: "reports", action: "read" },
	{ key: "settings.manage_store", resource: "settings", action: "manage_store" },
	{ key: "settings.manage_users", resource: "settings", action: "manage_users" },
	{ key: "settings.manage_roles", resource: "settings", action: "manage_roles" },
	{ key: "superadmin.manage", resource: "superadmin", action: "manage" },
	{ key: "system_admin.manage", resource: "system_admin", action: "manage" },
] as const;

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
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS role_permissions (
				role_id TEXT NOT NULL,
				permission_id TEXT NOT NULL,
				PRIMARY KEY (role_id, permission_id)
			)
		`);

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
	}

	private static async ensurePermissionSeed(): Promise<void> {
		await RbacInterface.ensureTables();
		const db = DbConn.getClient();
		const existingResult = await db.execute("SELECT key FROM permissions");
		const existingKeys = new Set(existingResult.rows.map((row) => String(row.key || "")));

		for (const permission of DEFAULT_PERMISSION_SEED) {
			if (existingKeys.has(permission.key)) continue;
			await db.execute({
				sql: `
					INSERT INTO permissions (id, key, resource, action)
					VALUES (?, ?, ?, ?)
				`,
				args: [ randomUUID(), permission.key, permission.resource, permission.action ],
			});
		}
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
		let sql = "SELECT * FROM roles";

		if (storeId) {
			sql += " WHERE store_id = ?";
			args.push(storeId);
		}

		sql += " ORDER BY is_system DESC, name ASC, created_at DESC";
		const result = await db.execute({ sql, args });
		const roles = result.rows.map((row) => mapRoleRow(row));

		return Promise.all(
			roles.map(async (role) => {
				const permissions = await RbacInterface.getPermissionsByRoleId(role.id);
				return {
					...role,
					permissions,
					permissions_count: permissions.length,
				};
			}),
		);
	}

	static async getRoleById(id: string): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM roles WHERE id = ? LIMIT 1",
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
		const where: string[] = [ "sm.user_id = ?" ];
		const args: InValue[] = [ userId ];

		if (storeId) {
			where.push("sm.store_id = ?");
			args.push(storeId);
		}

		const result = await db.execute({
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
				INNER JOIN roles r ON r.id = sm.role_id
				LEFT JOIN role_permissions rp ON rp.role_id = r.id
				LEFT JOIN permissions p ON p.id = rp.permission_id
				WHERE ${where.join(" AND ")}
				ORDER BY sm.store_id, r.name, p.resource, p.action, p.key
			`,
			args,
		});

		const membershipMap = new Map<string, UserAccessMembership>();
		const permissionMap = new Map<string, Permission>();

		for (const row of result.rows) {
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

		for (const permission of permissions) {
			await db.execute({
				sql: `
					INSERT INTO role_permissions (role_id, permission_id)
					VALUES (?, ?)
				`,
				args: [ roleId, permission.id ],
			});
		}
	}
}

export type { RoleWithPermissions, UserAccessSummary };
