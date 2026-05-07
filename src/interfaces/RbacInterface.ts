import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";
import bcrypt from "bcryptjs";

import { AuthInterface } from "@interfaces/AuthInterface";
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
	role_id: string;
	status?: string;
	system_role?: string;
	ui_locale?: string;
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

	static async duplicateRole(
		id: string,
		name: string,
	): Promise<RoleWithPermissions | null> {
		await RbacInterface.ensurePermissionSeed();
		const role = await RbacInterface.getRoleById(id);
		if (!role) return null;

		return RbacInterface.createRole({
			store_id: role.store_id,
			name,
			is_system: 0,
		}, role.permissions.map((permission) => permission.key));
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
				INNER JOIN roles r ON r.id = sm.role_id
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
			const insertResult = await db.execute({
				sql: `
					INSERT INTO users (
						name, email, password_hash, created_at, system_role,
						must_change_password, password_updated_at, ui_locale, client_suspended
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				args: [
					payload.name.trim(),
					normalizedEmail,
					passwordHash,
					new Date().toISOString(),
					payload.system_role?.trim() || "staff",
					0,
					new Date().toISOString(),
					payload.ui_locale?.trim() || "th",
					0,
				],
			});
			userId = String(insertResult.lastInsertRowid);
		}

		await RbacInterface.assignStoreMemberRole({
			store_id: payload.store_id,
			user_id: userId,
			role_id: payload.role_id,
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

export type {
	RoleWithPermissions,
	StoreMemberCreateInput,
	StoreMemberListItem,
	StoreMemberPasswordResetInput,
	StoreMemberStatusUpdateInput,
	UserAccessSummary,
};
