import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { AuthInterface } from "@interfaces/AuthInterface";
import { StoreInterface } from "@interfaces/StoreInterface";

export type SuperadminQuotaListParams = {
	search?: string;
	mode?: string;
	page?: number;
	limit?: number;
};

export type SuperadminQuotaRecord = {
	id: string;
	email: string;
	name: string;
	system_role: string;
	status: "active" | "suspended";
	can_create_stores: number;
	max_stores: number | null;
	can_create_branches: number;
	max_branches_per_store: number | null;
	owned_stores_count: number;
	remaining_store_capacity: number | null;
	created_at: string;
};

export type SuperadminQuotaListResult = {
	items: SuperadminQuotaRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
	summary: {
		accounts_total: number;
		store_quota_enabled: number;
		branch_quota_enabled: number;
		limited_store_capacity_total: number;
		remaining_store_capacity_total: number;
		unlimited_store_accounts: number;
		unlimited_branch_accounts: number;
		attention_accounts: number;
		stores_total: number;
	};
	warnings: string[];
};

function buildScopedUserWhere(): string {
	return `(
		u.id = ?
		OR u.created_by = ?
		OR EXISTS (
			SELECT 1
			FROM store_members sm
			INNER JOIN stores s ON s.id = sm.store_id
			WHERE sm.user_id = u.id
				AND s.owner_user_id = ?
		)
	)`;
}

function mapRow(row: Record<string, unknown>): SuperadminQuotaRecord {
	const ownedStoresCount = Number(row.owned_stores_count || 0);
	const maxStores = row.max_stores === null || row.max_stores === undefined ? null : Number(row.max_stores);
	return {
		id: String(row.id),
		email: String(row.email || ""),
		name: String(row.name || ""),
		system_role: String(row.system_role || "staff"),
		status: Number(row.client_suspended || 0) === 1 ? "suspended" : "active",
		can_create_stores: Number(row.can_create_stores || 0),
		max_stores: maxStores,
		can_create_branches: Number(row.can_create_branches || 0),
		max_branches_per_store: row.max_branches_per_store === null || row.max_branches_per_store === undefined
			? null
			: Number(row.max_branches_per_store),
		owned_stores_count: ownedStoresCount,
		remaining_store_capacity: maxStores === null ? null : Math.max(0, maxStores - ownedStoresCount),
		created_at: String(row.created_at || new Date(0).toISOString()),
	};
}

export class SuperadminQuotaInterface {
	static async listByOwner(
		ownerUserId: string,
		params: SuperadminQuotaListParams = {},
	): Promise<SuperadminQuotaListResult> {
		await AuthInterface.ensureUserAuthColumns();
		await StoreInterface.ensureOwnerColumn();

		const db = DbConn.getClient();
		const page = Math.max(1, Number(params.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
		const offset = (page - 1) * limit;

		const where = [ buildScopedUserWhere() ];
		const args: InValue[] = [ ownerUserId, ownerUserId, ownerUserId ];

		if (params.search?.trim()) {
			const keyword = `%${params.search.trim().toLowerCase()}%`;
			where.push("(LOWER(COALESCE(u.name, '')) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ?)");
			args.push(keyword, keyword);
		}

		if (params.mode === "store-enabled") {
			where.push("COALESCE(u.can_create_stores, 0) = 1");
		}

		if (params.mode === "limited") {
			where.push("COALESCE(u.can_create_stores, 0) = 1 AND u.max_stores IS NOT NULL");
		}

		if (params.mode === "unlimited") {
			where.push("COALESCE(u.can_create_stores, 0) = 1 AND u.max_stores IS NULL");
		}

		if (params.mode === "attention") {
			where.push(`(
				COALESCE(u.can_create_stores, 0) = 1
				AND u.max_stores IS NOT NULL
				AND (
					SELECT COUNT(*)
					FROM stores s
					WHERE s.owner_user_id = u.id
				) >= u.max_stores
			)`);
		}

		const whereClause = where.join(" AND ");

		const [countResult, summaryResult, rowsResult] = await Promise.all([
			db.execute({
				sql: `
					SELECT COUNT(*) AS total
					FROM users u
					WHERE ${whereClause}
				`,
				args,
			}),
			db.execute({
				sql: `
					SELECT
						COUNT(*) AS accounts_total,
						SUM(CASE WHEN COALESCE(u.can_create_stores, 0) = 1 THEN 1 ELSE 0 END) AS store_quota_enabled,
						SUM(CASE WHEN COALESCE(u.can_create_branches, 0) = 1 THEN 1 ELSE 0 END) AS branch_quota_enabled,
						SUM(CASE WHEN COALESCE(u.can_create_stores, 0) = 1 AND u.max_stores IS NOT NULL THEN u.max_stores ELSE 0 END) AS limited_store_capacity_total,
						SUM(CASE WHEN COALESCE(u.can_create_stores, 0) = 1 AND u.max_stores IS NULL THEN 1 ELSE 0 END) AS unlimited_store_accounts,
						SUM(CASE WHEN COALESCE(u.can_create_branches, 0) = 1 AND u.max_branches_per_store IS NULL THEN 1 ELSE 0 END) AS unlimited_branch_accounts,
						SUM(CASE WHEN COALESCE(u.can_create_stores, 0) = 1 AND u.max_stores IS NOT NULL AND (
							SELECT COUNT(*)
							FROM stores s
							WHERE s.owner_user_id = u.id
						) >= u.max_stores THEN 1 ELSE 0 END) AS attention_accounts,
						SUM(CASE WHEN COALESCE(u.can_create_stores, 0) = 1 AND u.max_stores IS NOT NULL THEN MAX(
							u.max_stores - (
								SELECT COUNT(*)
								FROM stores s
								WHERE s.owner_user_id = u.id
							),
							0
						) ELSE 0 END) AS remaining_store_capacity_total
					FROM users u
					WHERE ${buildScopedUserWhere()}
				`,
				args: [ ownerUserId, ownerUserId, ownerUserId ],
			}),
			db.execute({
				sql: `
					SELECT
						u.id,
						u.email,
						u.name,
						u.system_role,
						u.client_suspended,
						u.can_create_stores,
						u.max_stores,
						u.can_create_branches,
						u.max_branches_per_store,
						u.created_at,
						(
							SELECT COUNT(*)
							FROM stores s
							WHERE s.owner_user_id = u.id
						) AS owned_stores_count
					FROM users u
					WHERE ${whereClause}
					ORDER BY u.created_at DESC, u.name ASC
					LIMIT ? OFFSET ?
				`,
				args: [ ...args, limit, offset ],
			}),
		]);

		const summaryRow = summaryResult.rows[0] || {};
		const total = Number(countResult.rows[0]?.total || 0);
		const items = rowsResult.rows.map((row) => mapRow(row));
		const storesTotalResult = await db.execute({
			sql: "SELECT COUNT(*) AS total FROM stores WHERE owner_user_id = ?",
			args: [ ownerUserId ],
		});
		const storesTotal = Number(storesTotalResult.rows[0]?.total || 0);

		const result: SuperadminQuotaListResult = {
			items,
			page,
			limit,
			total,
			has_more: offset + items.length < total,
			summary: {
				accounts_total: Number(summaryRow.accounts_total || 0),
				store_quota_enabled: Number(summaryRow.store_quota_enabled || 0),
				branch_quota_enabled: Number(summaryRow.branch_quota_enabled || 0),
				limited_store_capacity_total: Number(summaryRow.limited_store_capacity_total || 0),
				remaining_store_capacity_total: Number(summaryRow.remaining_store_capacity_total || 0),
				unlimited_store_accounts: Number(summaryRow.unlimited_store_accounts || 0),
				unlimited_branch_accounts: Number(summaryRow.unlimited_branch_accounts || 0),
				attention_accounts: Number(summaryRow.attention_accounts || 0),
				stores_total: storesTotal,
			},
			warnings: [],
		};

		if (result.summary.attention_accounts > 0) {
			result.warnings.push(`มี ${result.summary.attention_accounts} บัญชีที่ใช้ store quota เต็มหรือเกินแล้ว`);
		}
		if (result.summary.store_quota_enabled === 0) {
			result.warnings.push("ยังไม่มีบัญชีใดใน scope นี้ที่เปิดสิทธิ์สร้างร้าน");
		}
		if (result.summary.branch_quota_enabled === 0) {
			result.warnings.push("ยังไม่มีบัญชีใดใน scope นี้ที่เปิดสิทธิ์สร้างสาขา");
		}

		return result;
	}
}
