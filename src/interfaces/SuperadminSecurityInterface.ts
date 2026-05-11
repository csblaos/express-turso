import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { AuthInterface } from "@interfaces/AuthInterface";
import { StoreInterface } from "@interfaces/StoreInterface";

export type SuperadminSecuritySnapshot = {
	checked_at: string;
	summary: {
		stores_total: number;
		stores_without_members: number;
		store_members_total: number;
		users_total: number;
		users_active: number;
		users_suspended: number;
		users_must_change_password: number;
	};
	role_breakdown: {
		superadmin: number;
		owner: number;
		manager: number;
		cashier: number;
		other: number;
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

export class SuperadminSecurityInterface {
	private static async count(sql: string, args: InValue[] = []): Promise<number> {
		const db = DbConn.getClient();
		const result = await db.execute({ sql, args });
		return Number(result.rows[0]?.total || 0);
	}

	static async getSnapshot(ownerUserId: string): Promise<SuperadminSecuritySnapshot> {
		await AuthInterface.ensureUserAuthColumns();
		await StoreInterface.ensureOwnerColumn();

		const checkedAt = new Date().toISOString();
		const scopedUserWhere = buildScopedUserWhere();
		const scopedUserArgs: InValue[] = [ ownerUserId, ownerUserId, ownerUserId ];

		const [
			storesTotal,
			storesWithoutMembers,
			storeMembersTotal,
			usersSummaryResult,
			roleBreakdownResult,
		] = await Promise.all([
			SuperadminSecurityInterface.count(
				"SELECT COUNT(*) AS total FROM stores WHERE owner_user_id = ?",
				[ ownerUserId ],
			),
			SuperadminSecurityInterface.count(
				`SELECT COUNT(*) AS total
				 FROM stores s
				 WHERE s.owner_user_id = ?
				   AND NOT EXISTS (
					  SELECT 1
					  FROM store_members sm
					  WHERE sm.store_id = s.id
				   )`,
				[ ownerUserId ],
			),
			SuperadminSecurityInterface.count(
				`SELECT COUNT(*) AS total
				 FROM store_members sm
				 INNER JOIN stores s ON s.id = sm.store_id
				 WHERE s.owner_user_id = ?`,
				[ ownerUserId ],
			),
			DbConn.getClient().execute({
				sql: `SELECT
					COUNT(*) AS users_total,
					SUM(CASE WHEN COALESCE(u.client_suspended, 0) = 0 THEN 1 ELSE 0 END) AS users_active,
					SUM(CASE WHEN COALESCE(u.client_suspended, 0) = 1 THEN 1 ELSE 0 END) AS users_suspended,
					SUM(CASE WHEN COALESCE(u.must_change_password, 0) = 1 THEN 1 ELSE 0 END) AS users_must_change_password
				FROM users u
				WHERE ${scopedUserWhere}`,
				args: scopedUserArgs,
			}),
			DbConn.getClient().execute({
				sql: `SELECT
					LOWER(COALESCE(u.system_role, '')) AS system_role,
					COUNT(*) AS total
				FROM users u
				WHERE ${scopedUserWhere}
				GROUP BY LOWER(COALESCE(u.system_role, ''))`,
				args: scopedUserArgs,
			}),
		]);

		const usersSummaryRow = usersSummaryResult.rows[0] || {};
		const roleBreakdown = {
			superadmin: 0,
			owner: 0,
			manager: 0,
			cashier: 0,
			other: 0,
		};

		for (const row of roleBreakdownResult.rows) {
			const role = String(row.system_role || "");
			const total = Number(row.total || 0);
			if (role === "superadmin") roleBreakdown.superadmin += total;
			else if (role === "owner") roleBreakdown.owner += total;
			else if (role === "manager") roleBreakdown.manager += total;
			else if (role === "cashier") roleBreakdown.cashier += total;
			else roleBreakdown.other += total;
		}

		const snapshot: SuperadminSecuritySnapshot = {
			checked_at: checkedAt,
			summary: {
				stores_total: storesTotal,
				stores_without_members: storesWithoutMembers,
				store_members_total: storeMembersTotal,
				users_total: Number(usersSummaryRow.users_total || 0),
				users_active: Number(usersSummaryRow.users_active || 0),
				users_suspended: Number(usersSummaryRow.users_suspended || 0),
				users_must_change_password: Number(usersSummaryRow.users_must_change_password || 0),
			},
			role_breakdown: roleBreakdown,
			warnings: [],
		};

		if (snapshot.summary.users_must_change_password > 0) {
			snapshot.warnings.push(`ยังมี ${snapshot.summary.users_must_change_password} บัญชีที่ควรเปลี่ยนรหัสผ่านก่อนใช้งานต่อ`);
		}
		if (snapshot.summary.users_suspended > 0) {
			snapshot.warnings.push(`มี ${snapshot.summary.users_suspended} บัญชีที่ถูกระงับอยู่ใน scope ของ superadmin นี้`);
		}
		if (snapshot.summary.stores_without_members > 0) {
			snapshot.warnings.push(`ยังมี ${snapshot.summary.stores_without_members} ร้านที่ยังไม่มีสมาชิกในทีม`);
		}

		return snapshot;
	}
}
