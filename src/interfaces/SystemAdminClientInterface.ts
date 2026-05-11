import { randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { AuthInterface } from "@interfaces/AuthInterface";

export type SystemAdminClientRecord = {
	id: string;
	email: string;
	name: string;
	system_role: string;
	ui_locale: string;
	can_create_stores: number;
	max_stores: number | null;
	can_create_branches: number;
	max_branches_per_store: number | null;
	must_change_password: number;
	client_suspended: number;
	client_suspended_at: string | null;
	client_suspended_reason: string | null;
	client_suspended_by: string | null;
	created_by: string | null;
	created_at: string;
	status: "active" | "suspended";
};

export type SystemAdminClientListParams = {
	search?: string;
	status?: string;
	page?: number;
	limit?: number;
};

export type SystemAdminClientListResult = {
	items: SystemAdminClientRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
	summary: {
		total: number;
		active: number;
		suspended: number;
	};
};

export type SystemAdminClientSummary = {
	total: number;
	active: number;
	suspended: number;
};

export type SystemAdminClientCreateInput = {
	name: string;
	email: string;
	password: string;
	ui_locale?: string | null;
	max_stores?: number | null;
	can_create_stores?: number | null;
	max_branches_per_store?: number | null;
	can_create_branches?: number | null;
	must_change_password?: boolean;
	created_by?: string | null;
};

export type SystemAdminClientUpdateInput = {
	name?: string | null;
	email?: string | null;
	ui_locale?: string | null;
	max_stores?: number | null;
	can_create_stores?: number | null;
	max_branches_per_store?: number | null;
	can_create_branches?: number | null;
	must_change_password?: boolean;
};

export type SystemAdminClientStatusInput = {
	status: "active" | "suspended";
	reason?: string | null;
	actor_user_id?: string | null;
};

export type SystemAdminClientPasswordResetInput = {
	password: string;
	must_change_password?: boolean;
	actor_user_id?: string | null;
};

export type SystemAdminClientDeleteCheck = {
	client_id: string;
	can_delete: boolean;
	counts: {
		stores: number;
		branches: number;
		store_memberships: number;
		orders: number;
		purchase_orders: number;
		inventory_balances: number;
		inventory_movements: number;
		store_integrations: number;
		fb_connections: number;
		wa_connections: number;
	};
	reasons: string[];
};

const CLIENT_ADMIN_COLUMNS = [
	{
		name: "can_create_stores",
		sql: "ALTER TABLE users ADD COLUMN can_create_stores INTEGER",
	},
	{
		name: "max_stores",
		sql: "ALTER TABLE users ADD COLUMN max_stores INTEGER",
	},
	{
		name: "can_create_branches",
		sql: "ALTER TABLE users ADD COLUMN can_create_branches INTEGER",
	},
	{
		name: "max_branches_per_store",
		sql: "ALTER TABLE users ADD COLUMN max_branches_per_store INTEGER",
	},
	{
		name: "created_by",
		sql: "ALTER TABLE users ADD COLUMN created_by TEXT",
	},
] as const;

const CLIENT_SELECT_COLUMNS = `
	id,
	email,
	name,
	system_role,
	ui_locale,
	can_create_stores,
	max_stores,
	can_create_branches,
	max_branches_per_store,
	must_change_password,
	client_suspended,
	client_suspended_at,
	client_suspended_reason,
	client_suspended_by,
	created_by,
	created_at
`;

function mapRow(row: Record<string, unknown>): SystemAdminClientRecord {
	const suspended = Number(row.client_suspended || 0) === 1;

	return {
		id: String(row.id),
		email: String(row.email),
		name: String(row.name),
		system_role: String(row.system_role || "superadmin"),
		ui_locale: String(row.ui_locale || "th"),
		can_create_stores: Number(row.can_create_stores || 0),
		max_stores: row.max_stores === null || row.max_stores === undefined ? null : Number(row.max_stores),
		can_create_branches: Number(row.can_create_branches || 0),
		max_branches_per_store: row.max_branches_per_store === null || row.max_branches_per_store === undefined ? null : Number(row.max_branches_per_store),
		must_change_password: Number(row.must_change_password || 0),
		client_suspended: suspended ? 1 : 0,
		client_suspended_at: row.client_suspended_at ? String(row.client_suspended_at) : null,
		client_suspended_reason: row.client_suspended_reason ? String(row.client_suspended_reason) : null,
		client_suspended_by: row.client_suspended_by ? String(row.client_suspended_by) : null,
		created_by: row.created_by ? String(row.created_by) : null,
		created_at: String(row.created_at),
		status: suspended ? "suspended" : "active",
	};
}

export class SystemAdminClientInterface {
	private static columnsEnsured = false;
	private static ensureColumnsPromise: Promise<void> | null = null;

	static async ensureColumns(): Promise<void> {
		if (SystemAdminClientInterface.columnsEnsured) return;
		if (SystemAdminClientInterface.ensureColumnsPromise) {
			return SystemAdminClientInterface.ensureColumnsPromise;
		}

		SystemAdminClientInterface.ensureColumnsPromise = (async () => {
			await AuthInterface.ensureUserAuthColumns();
			const db = DbConn.getClient();
			const pragmaResult = await db.execute("PRAGMA table_info(users)");
			const existingColumns = new Set(
				pragmaResult.rows.map((row) => String(row.name || "")),
			);

			for (const column of CLIENT_ADMIN_COLUMNS) {
				if (existingColumns.has(column.name)) continue;
				await db.execute(column.sql);
			}

			SystemAdminClientInterface.columnsEnsured = true;
		})().catch((error) => {
			SystemAdminClientInterface.ensureColumnsPromise = null;
			throw error;
		});

		return SystemAdminClientInterface.ensureColumnsPromise;
	}

	static async list(params: SystemAdminClientListParams = {}): Promise<SystemAdminClientListResult> {
		await SystemAdminClientInterface.ensureColumns();
		const db = DbConn.getClient();
		const page = Math.max(1, Number(params.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
		const offset = (page - 1) * limit;
		const where = [ "system_role = ?" ];
		const args: InValue[] = [ "superadmin" ];

		if (params.status === "active") {
			where.push("client_suspended = 0");
		}

		if (params.status === "suspended") {
			where.push("client_suspended = 1");
		}

		if (params.search?.trim()) {
			const keyword = `%${params.search.trim().toLowerCase()}%`;
			where.push("(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)");
			args.push(keyword, keyword);
		}

		const countResult = await db.execute({
			sql: `
				SELECT
					COUNT(*) as total,
					SUM(CASE WHEN client_suspended = 0 THEN 1 ELSE 0 END) as active,
					SUM(CASE WHEN client_suspended = 1 THEN 1 ELSE 0 END) as suspended
				FROM users
				WHERE ${where.join(" AND ")}
			`,
			args,
		});

		const total = Number(countResult.rows[0]?.total || 0);
		const active = Number(countResult.rows[0]?.active || 0);
		const suspended = Number(countResult.rows[0]?.suspended || 0);

		const result = await db.execute({
			sql: `
				SELECT ${CLIENT_SELECT_COLUMNS}
				FROM users
				WHERE ${where.join(" AND ")}
				ORDER BY created_at DESC, name ASC
				LIMIT ? OFFSET ?
			`,
			args: [ ...args, limit, offset ],
		});

		return {
			items: result.rows.map((row) => mapRow(row)),
			page,
			limit,
			total,
			has_more: offset + result.rows.length < total,
			summary: {
				total,
				active,
				suspended,
			},
		};
	}

	static async getSummary(): Promise<SystemAdminClientSummary> {
		await SystemAdminClientInterface.ensureColumns();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT
					COUNT(*) as total,
					SUM(CASE WHEN client_suspended = 0 THEN 1 ELSE 0 END) as active,
					SUM(CASE WHEN client_suspended = 1 THEN 1 ELSE 0 END) as suspended
				FROM users
				WHERE system_role = ?
			`,
			args: [ "superadmin" ],
		});

		return {
			total: Number(result.rows[0]?.total || 0),
			active: Number(result.rows[0]?.active || 0),
			suspended: Number(result.rows[0]?.suspended || 0),
		};
	}

	static async findById(id: string): Promise<SystemAdminClientRecord | null> {
		await SystemAdminClientInterface.ensureColumns();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT ${CLIENT_SELECT_COLUMNS}
				FROM users
				WHERE id = ? AND system_role = ?
				LIMIT 1
			`,
			args: [ id, "superadmin" ],
		});

		if (result.rows.length === 0) return null;
		return mapRow(result.rows[0]);
	}

	static async create(input: SystemAdminClientCreateInput): Promise<SystemAdminClientRecord> {
		await SystemAdminClientInterface.ensureColumns();
		const db = DbConn.getClient();
		const normalizedEmail = input.email.trim().toLowerCase();
		const existing = await db.execute({
			sql: "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
			args: [ normalizedEmail ],
		});

		if (existing.rows.length > 0) {
			throw new Error("CLIENT_ALREADY_EXISTS");
		}

		const id = randomUUID();
		const now = new Date().toISOString();
		const passwordHash = await bcrypt.hash(input.password, 10);

		await db.execute({
			sql: `
				INSERT INTO users (
					id, email, name, password_hash, created_at, session_limit, system_role,
					can_create_stores, max_stores, can_create_branches, max_branches_per_store,
					created_by, must_change_password, password_updated_at, ui_locale,
					client_suspended, client_suspended_at, client_suspended_reason, client_suspended_by
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
			args: [
				id,
				normalizedEmail,
				input.name.trim(),
				passwordHash,
				now,
				null,
				"superadmin",
				input.can_create_stores ?? 1,
				input.max_stores ?? 1,
				input.can_create_branches ?? 1,
				input.max_branches_per_store ?? null,
				input.created_by ?? null,
				input.must_change_password ? 1 : 0,
				now,
				input.ui_locale?.trim() || "th",
				0,
				null,
				null,
				null,
			],
		});

		const created = await SystemAdminClientInterface.findById(id);
		if (!created) {
			throw new Error("Failed to create client");
		}

		return created;
	}

	static async update(id: string, input: SystemAdminClientUpdateInput): Promise<SystemAdminClientRecord | null> {
		await SystemAdminClientInterface.ensureColumns();
		const updatePayload: Record<string, InValue> = {};
		const db = DbConn.getClient();

		if (input.name !== undefined) updatePayload.name = input.name?.trim() || "";
		if (input.email !== undefined) {
			const normalizedEmail = input.email?.trim().toLowerCase() || "";
			const existing = await db.execute({
				sql: "SELECT id FROM users WHERE LOWER(email) = ? AND id != ? LIMIT 1",
				args: [ normalizedEmail, id ],
			});

			if (existing.rows.length > 0) {
				throw new Error("CLIENT_ALREADY_EXISTS");
			}

			updatePayload.email = normalizedEmail;
		}
		if (input.ui_locale !== undefined) updatePayload.ui_locale = input.ui_locale?.trim() || "th";
		if (input.max_stores !== undefined) updatePayload.max_stores = input.max_stores;
		if (input.can_create_stores !== undefined) updatePayload.can_create_stores = input.can_create_stores;
		if (input.max_branches_per_store !== undefined) updatePayload.max_branches_per_store = input.max_branches_per_store;
		if (input.can_create_branches !== undefined) updatePayload.can_create_branches = input.can_create_branches;
		if (input.must_change_password !== undefined) updatePayload.must_change_password = input.must_change_password ? 1 : 0;

		const keys = Object.keys(updatePayload);
		if (keys.length === 0) {
			return SystemAdminClientInterface.findById(id);
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");

		await db.execute({
			sql: `UPDATE users SET ${setClause} WHERE id = ? AND system_role = ?`,
			args: [ ...Object.values(updatePayload), id, "superadmin" ],
		});

		return SystemAdminClientInterface.findById(id);
	}

	static async updateStatus(id: string, input: SystemAdminClientStatusInput): Promise<SystemAdminClientRecord | null> {
		await SystemAdminClientInterface.ensureColumns();
		const db = DbConn.getClient();
		const nextSuspended = input.status === "suspended" ? 1 : 0;
		const suspendedAt = nextSuspended ? new Date().toISOString() : null;
		const suspendedReason = nextSuspended ? input.reason?.trim() || null : null;
		const suspendedBy = nextSuspended ? input.actor_user_id || null : null;

		await db.execute({
			sql: `
				UPDATE users
				SET
					client_suspended = ?,
					client_suspended_at = ?,
					client_suspended_reason = ?,
					client_suspended_by = ?
				WHERE id = ? AND system_role = ?
			`,
			args: [
				nextSuspended,
				suspendedAt,
				suspendedReason,
				suspendedBy,
				id,
				"superadmin",
			],
		});

		return SystemAdminClientInterface.findById(id);
	}

	static async resetPassword(id: string, input: SystemAdminClientPasswordResetInput): Promise<SystemAdminClientRecord | null> {
		await SystemAdminClientInterface.ensureColumns();
		const client = await SystemAdminClientInterface.findById(id);
		if (!client) return null;

		const db = DbConn.getClient();
		const passwordHash = await bcrypt.hash(input.password, 10);

		await db.execute({
			sql: `
				UPDATE users
				SET
					password_hash = ?,
					must_change_password = ?,
					password_updated_at = ?
				WHERE id = ? AND system_role = ?
			`,
			args: [
				passwordHash,
				input.must_change_password ? 1 : 0,
				new Date().toISOString(),
				id,
				"superadmin",
			],
		});

		return SystemAdminClientInterface.findById(id);
	}

	private static async safeCount(sql: string, args: InValue[] = []): Promise<number> {
		const db = DbConn.getClient();

		try {
			const result = await db.execute({
				sql,
				args,
			});

			return Number(result.rows[0]?.total || 0);
		} catch {
			return 0;
		}
	}

	static async getDeleteCheck(id: string): Promise<SystemAdminClientDeleteCheck | null> {
		await SystemAdminClientInterface.ensureColumns();
		const client = await SystemAdminClientInterface.findById(id);
		if (!client) return null;

		const counts = {
			stores: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM stores WHERE owner_user_id = ?",
				[ id ],
			),
			branches: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM store_branches WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			store_memberships: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM store_members WHERE user_id = ? OR store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id, id ],
			),
			orders: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM orders WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			purchase_orders: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM purchase_orders WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			inventory_balances: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM inventory_balances WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			inventory_movements: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM inventory_movements WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			store_integrations: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM store_integrations WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			fb_connections: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM fb_connections WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
			wa_connections: await SystemAdminClientInterface.safeCount(
				"SELECT COUNT(*) AS total FROM wa_connections WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
				[ id ],
			),
		};

		const reasons: string[] = [];
		if (counts.stores > 0) reasons.push(`ยังมีร้านที่ผูกกับ client นี้ ${counts.stores} รายการ`);
		if (counts.branches > 0) reasons.push(`ยังมีสาขาที่อยู่ใต้ร้านของ client นี้ ${counts.branches} รายการ`);
		if (counts.store_memberships > 0) reasons.push(`ยังมี membership หรือบทบาทที่ผูกกับ client นี้ ${counts.store_memberships} รายการ`);
		if (counts.orders > 0) reasons.push(`ยังมีออเดอร์ของร้านใน client นี้ ${counts.orders} รายการ`);
		if (counts.purchase_orders > 0) reasons.push(`ยังมีใบสั่งซื้อของร้านใน client นี้ ${counts.purchase_orders} รายการ`);
		if (counts.inventory_balances > 0) reasons.push(`ยังมีสต็อกคงเหลือของร้านใน client นี้ ${counts.inventory_balances} รายการ`);
		if (counts.inventory_movements > 0) reasons.push(`ยังมีประวัติการเคลื่อนไหวสต็อก ${counts.inventory_movements} รายการ`);
		if (counts.store_integrations > 0) reasons.push(`ยังมี integration ของร้านใน client นี้ ${counts.store_integrations} รายการ`);
		if (counts.fb_connections > 0) reasons.push(`ยังมี Facebook connection ${counts.fb_connections} รายการ`);
		if (counts.wa_connections > 0) reasons.push(`ยังมี WhatsApp connection ${counts.wa_connections} รายการ`);

		return {
			client_id: id,
			can_delete: reasons.length === 0,
			counts,
			reasons,
		};
	}

	static async delete(id: string): Promise<boolean> {
		await SystemAdminClientInterface.ensureColumns();
		const db = DbConn.getClient();
		const existing = await SystemAdminClientInterface.findById(id);
		if (!existing) return false;

		await db.execute({
			sql: "DELETE FROM users WHERE id = ? AND system_role = ?",
			args: [ id, "superadmin" ],
		});

		return true;
	}
}
