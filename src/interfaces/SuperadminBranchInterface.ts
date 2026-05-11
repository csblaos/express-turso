import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { StoreInterface } from "@interfaces/StoreInterface";

export type SuperadminBranchListParams = {
	search?: string;
	mode?: string;
	page?: number;
	limit?: number;
};

export type SuperadminBranchRecord = {
	id: string;
	store_id: string;
	store_name: string;
	name: string;
	code: string | null;
	address: string | null;
	created_at: string;
	source_branch_id: string | null;
	sharing_mode: string | null;
	sharing_config: string | null;
};

export type SuperadminBranchListResult = {
	items: SuperadminBranchRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
	summary: {
		branches_total: number;
		stores_covered: number;
		linked_branches: number;
		custom_sharing_branches: number;
		missing_code: number;
		missing_address: number;
	};
	warnings: string[];
};

function mapRow(row: Record<string, unknown>): SuperadminBranchRecord {
	return {
		id: String(row.id),
		store_id: String(row.store_id),
		store_name: String(row.store_name || ""),
		name: String(row.name || ""),
		code: row.code ? String(row.code) : null,
		address: row.address ? String(row.address) : null,
		created_at: String(row.created_at || new Date(0).toISOString()),
		source_branch_id: row.source_branch_id ? String(row.source_branch_id) : null,
		sharing_mode: row.sharing_mode ? String(row.sharing_mode) : null,
		sharing_config: row.sharing_config ? String(row.sharing_config) : null,
	};
}

export class SuperadminBranchInterface {
	static async listByOwner(
		ownerUserId: string,
		params: SuperadminBranchListParams = {},
	): Promise<SuperadminBranchListResult> {
		await StoreInterface.ensureOwnerColumn();

		const db = DbConn.getClient();
		const page = Math.max(1, Number(params.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
		const offset = (page - 1) * limit;

		const where = [ "s.owner_user_id = ?" ];
		const args: InValue[] = [ ownerUserId ];

		if (params.search?.trim()) {
			const keyword = `%${params.search.trim().toLowerCase()}%`;
			where.push(`(
				LOWER(COALESCE(sb.name, '')) LIKE ?
				OR LOWER(COALESCE(sb.code, '')) LIKE ?
				OR LOWER(COALESCE(sb.address, '')) LIKE ?
				OR LOWER(COALESCE(s.name, '')) LIKE ?
			)`);
			args.push(keyword, keyword, keyword, keyword);
		}

		if (params.mode === "linked") {
			where.push("sb.source_branch_id IS NOT NULL");
		}

		if (params.mode === "sharing") {
			where.push("sb.sharing_mode IS NOT NULL");
		}

		if (params.mode === "missing-code") {
			where.push("(sb.code IS NULL OR TRIM(sb.code) = '')");
		}

		if (params.mode === "missing-address") {
			where.push("(sb.address IS NULL OR TRIM(sb.address) = '')");
		}

		const whereClause = where.join(" AND ");

		const [countResult, summaryResult, rowsResult] = await Promise.all([
			db.execute({
				sql: `
					SELECT COUNT(*) AS total
					FROM store_branches sb
					INNER JOIN stores s ON s.id = sb.store_id
					WHERE ${whereClause}
				`,
				args,
			}),
			db.execute({
				sql: `
					SELECT
						COUNT(*) AS branches_total,
						COUNT(DISTINCT sb.store_id) AS stores_covered,
						SUM(CASE WHEN sb.source_branch_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_branches,
						SUM(CASE WHEN sb.sharing_mode IS NOT NULL THEN 1 ELSE 0 END) AS custom_sharing_branches,
						SUM(CASE WHEN sb.code IS NULL OR TRIM(sb.code) = '' THEN 1 ELSE 0 END) AS missing_code,
						SUM(CASE WHEN sb.address IS NULL OR TRIM(sb.address) = '' THEN 1 ELSE 0 END) AS missing_address
					FROM store_branches sb
					INNER JOIN stores s ON s.id = sb.store_id
					WHERE s.owner_user_id = ?
				`,
				args: [ ownerUserId ],
			}),
			db.execute({
				sql: `
					SELECT
						sb.id,
						sb.store_id,
						s.name AS store_name,
						sb.name,
						sb.code,
						sb.address,
						sb.created_at,
						sb.source_branch_id,
						sb.sharing_mode,
						sb.sharing_config
					FROM store_branches sb
					INNER JOIN stores s ON s.id = sb.store_id
					WHERE ${whereClause}
					ORDER BY sb.created_at DESC, sb.name ASC
					LIMIT ? OFFSET ?
				`,
				args: [ ...args, limit, offset ],
			}),
		]);

		const total = Number(countResult.rows[0]?.total || 0);
		const summaryRow = summaryResult.rows[0] || {};
		const result: SuperadminBranchListResult = {
			items: rowsResult.rows.map((row) => mapRow(row)),
			page,
			limit,
			total,
			has_more: offset + rowsResult.rows.length < total,
			summary: {
				branches_total: Number(summaryRow.branches_total || 0),
				stores_covered: Number(summaryRow.stores_covered || 0),
				linked_branches: Number(summaryRow.linked_branches || 0),
				custom_sharing_branches: Number(summaryRow.custom_sharing_branches || 0),
				missing_code: Number(summaryRow.missing_code || 0),
				missing_address: Number(summaryRow.missing_address || 0),
			},
			warnings: [],
		};

		if (result.summary.missing_code > 0) {
			result.warnings.push(`ยังมี ${result.summary.missing_code} สาขาที่ไม่มี branch code`);
		}
		if (result.summary.missing_address > 0) {
			result.warnings.push(`ยังมี ${result.summary.missing_address} สาขาที่ไม่มีที่อยู่`);
		}

		return result;
	}
}
