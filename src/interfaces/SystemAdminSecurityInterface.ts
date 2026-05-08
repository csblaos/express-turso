import { DbConn } from "@connections/DbConn";

type SecuritySummaryCounts = {
	users_total: number;
	users_system_admin: number;
	users_superadmin: number;
	users_suspended: number;
	users_must_change_password: number;
	users_without_password_hash: number;
	stores_total: number;
	store_members_total: number;
};

function toCount(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export class SystemAdminSecurityInterface {
	private static async count(sql: string, args: Array<string | number | null> = []): Promise<number> {
		const db = DbConn.getClient();
		const result = await db.execute({ sql, args });
		return toCount(result.rows[0]?.total);
	}

	private static async countSafe(sql: string, args: Array<string | number | null> = []): Promise<number> {
		try {
			return await SystemAdminSecurityInterface.count(sql, args);
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message.toLowerCase().includes("no such table")) {
				return 0;
			}
			throw error;
		}
	}

	static async getSummaryCounts(): Promise<SecuritySummaryCounts> {
		const [
			usersTotal,
			usersSystemAdmin,
			usersSuperadmin,
			usersSuspended,
			usersMustChangePassword,
			usersWithoutPasswordHash,
			storesTotal,
			storeMembersTotal,
		] = await Promise.all([
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM users"),
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM users WHERE LOWER(COALESCE(system_role, '')) = 'system_admin'"),
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM users WHERE LOWER(COALESCE(system_role, '')) = 'superadmin'"),
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM users WHERE COALESCE(client_suspended, 0) = 1"),
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM users WHERE COALESCE(must_change_password, 0) = 1"),
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM users WHERE TRIM(COALESCE(password_hash, '')) = ''"),
			SystemAdminSecurityInterface.count("SELECT COUNT(*) AS total FROM stores"),
			SystemAdminSecurityInterface.countSafe("SELECT COUNT(*) AS total FROM user_store_memberships"),
		]);

		return {
			users_total: usersTotal,
			users_system_admin: usersSystemAdmin,
			users_superadmin: usersSuperadmin,
			users_suspended: usersSuspended,
			users_must_change_password: usersMustChangePassword,
			users_without_password_hash: usersWithoutPasswordHash,
			stores_total: storesTotal,
			store_members_total: storeMembersTotal,
		};
	}
}
