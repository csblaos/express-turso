import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { AuthInterface } from "@interfaces/AuthInterface";
import { RbacInterface } from "@interfaces/RbacInterface";
import { StoreInterface } from "@interfaces/StoreInterface";

export type SuperadminScopedUserRecord = {
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
	status: "active" | "suspended";
	client_suspended_reason: string | null;
	created_at: string;
	membership_count: number;
	primary_store_id: string | null;
	primary_store_name: string | null;
	primary_role_id: string | null;
	primary_role_name: string | null;
	primary_member_status: string | null;
};

export type SuperadminScopedUserListParams = {
	search?: string;
	status?: string;
	page?: number;
	limit?: number;
};

export type SuperadminScopedUserListResult = {
	items: SuperadminScopedUserRecord[];
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

function mapRow(row: Record<string, unknown>): SuperadminScopedUserRecord {
	const suspended = Number(row.client_suspended || 0) === 1;
	return {
		id: String(row.id),
		email: String(row.email || ""),
		name: String(row.name || ""),
		system_role: String(row.system_role || "staff"),
		ui_locale: String(row.ui_locale || "th"),
		can_create_stores: Number(row.can_create_stores || 0),
		max_stores: row.max_stores === null || row.max_stores === undefined ? null : Number(row.max_stores),
		can_create_branches: Number(row.can_create_branches || 0),
		max_branches_per_store: row.max_branches_per_store === null || row.max_branches_per_store === undefined ? null : Number(row.max_branches_per_store),
		must_change_password: Number(row.must_change_password || 0),
		status: suspended ? "suspended" : "active",
		client_suspended_reason: row.client_suspended_reason ? String(row.client_suspended_reason) : null,
		created_at: String(row.created_at || new Date(0).toISOString()),
		membership_count: Number(row.membership_count || 0),
		primary_store_id: row.primary_store_id ? String(row.primary_store_id) : null,
		primary_store_name: row.primary_store_name ? String(row.primary_store_name) : null,
		primary_role_id: row.primary_role_id ? String(row.primary_role_id) : null,
		primary_role_name: row.primary_role_name ? String(row.primary_role_name) : null,
		primary_member_status: row.primary_member_status ? String(row.primary_member_status) : null,
	};
}

export class SuperadminUserInterface {
	static async listByOwner(
		ownerUserId: string,
		params: SuperadminScopedUserListParams = {},
	): Promise<SuperadminScopedUserListResult> {
		await AuthInterface.ensureUserAuthColumns();
		await StoreInterface.ensureOwnerColumn();
		await RbacInterface.listPermissions();

		const db = DbConn.getClient();
		const page = Math.max(1, Number(params.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
		const offset = (page - 1) * limit;

		const where = [
			`(
				u.id = ?
				OR u.created_by = ?
				OR EXISTS (
					SELECT 1
					FROM store_members sm
					INNER JOIN stores s ON s.id = sm.store_id
					WHERE sm.user_id = u.id
						AND s.owner_user_id = ?
				)
			)`,
		];
		const args: InValue[] = [ ownerUserId, ownerUserId, ownerUserId ];

		if (params.status === "active") {
			where.push("COALESCE(u.client_suspended, 0) = 0");
		}

		if (params.status === "suspended") {
			where.push("COALESCE(u.client_suspended, 0) = 1");
		}

		if (params.search?.trim()) {
			const keyword = `%${params.search.trim().toLowerCase()}%`;
			where.push("(LOWER(COALESCE(u.name, '')) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ?)");
			args.push(keyword, keyword);
		}

		const whereClause = where.join(" AND ");
		const countResult = await db.execute({
			sql: `
				SELECT
					COUNT(*) AS total,
					SUM(CASE WHEN COALESCE(u.client_suspended, 0) = 0 THEN 1 ELSE 0 END) AS active,
					SUM(CASE WHEN COALESCE(u.client_suspended, 0) = 1 THEN 1 ELSE 0 END) AS suspended
				FROM users u
				WHERE ${whereClause}
			`,
			args,
		});

		const total = Number(countResult.rows[0]?.total || 0);
		const active = Number(countResult.rows[0]?.active || 0);
		const suspended = Number(countResult.rows[0]?.suspended || 0);

		const rowsResult = await db.execute({
			sql: `
				SELECT
					u.id,
					u.email,
					u.name,
					u.system_role,
					u.ui_locale,
					u.can_create_stores,
					u.max_stores,
					u.can_create_branches,
					u.max_branches_per_store,
					u.must_change_password,
					u.client_suspended,
					u.client_suspended_reason,
					u.created_at,
					(
						SELECT COUNT(*)
						FROM store_members sm
						INNER JOIN stores s ON s.id = sm.store_id
						WHERE sm.user_id = u.id
							AND s.owner_user_id = ?
					) AS membership_count,
					(
						SELECT sm.store_id
						FROM store_members sm
						INNER JOIN stores s ON s.id = sm.store_id
						WHERE sm.user_id = u.id
							AND s.owner_user_id = ?
						ORDER BY sm.created_at DESC
						LIMIT 1
					) AS primary_store_id,
					(
						SELECT s.name
						FROM store_members sm
						INNER JOIN stores s ON s.id = sm.store_id
						WHERE sm.user_id = u.id
							AND s.owner_user_id = ?
						ORDER BY sm.created_at DESC
						LIMIT 1
					) AS primary_store_name,
					(
						SELECT sm.role_id
						FROM store_members sm
						INNER JOIN stores s ON s.id = sm.store_id
						WHERE sm.user_id = u.id
							AND s.owner_user_id = ?
						ORDER BY sm.created_at DESC
						LIMIT 1
					) AS primary_role_id,
					(
						SELECT r.name
						FROM store_members sm
						INNER JOIN stores s ON s.id = sm.store_id
						INNER JOIN roles r ON r.id = sm.role_id
						WHERE sm.user_id = u.id
							AND s.owner_user_id = ?
						ORDER BY sm.created_at DESC
						LIMIT 1
					) AS primary_role_name,
					(
						SELECT sm.status
						FROM store_members sm
						INNER JOIN stores s ON s.id = sm.store_id
						WHERE sm.user_id = u.id
							AND s.owner_user_id = ?
						ORDER BY sm.created_at DESC
						LIMIT 1
					) AS primary_member_status
				FROM users u
				WHERE ${whereClause}
				ORDER BY u.created_at DESC, u.name ASC
				LIMIT ? OFFSET ?
			`,
			args: [ ...args, ownerUserId, ownerUserId, ownerUserId, ownerUserId, ownerUserId, ownerUserId, limit, offset ],
		});

		return {
			items: rowsResult.rows.map((row) => mapRow(row)),
			page,
			limit,
			total,
			has_more: offset + rowsResult.rows.length < total,
			summary: {
				total,
				active,
				suspended,
			},
		};
	}
}
