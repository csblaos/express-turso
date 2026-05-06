import { DbConn } from "@connections/DbConn";
import { SystemConfig, SystemConfigUpdateInput } from "@models/SystemConfig";

const DEFAULT_SYSTEM_CONFIG_ID = "default";
const AUTH_POLICY_COLUMNS = [
	{
		name: "auth_access_token_ttl_minutes",
		sql: "ALTER TABLE system_config ADD COLUMN auth_access_token_ttl_minutes INTEGER NOT NULL DEFAULT 15",
	},
	{
		name: "auth_refresh_token_ttl_days",
		sql: "ALTER TABLE system_config ADD COLUMN auth_refresh_token_ttl_days INTEGER NOT NULL DEFAULT 7",
	},
	{
		name: "auth_remember_me_refresh_ttl_days",
		sql: "ALTER TABLE system_config ADD COLUMN auth_remember_me_refresh_ttl_days INTEGER NOT NULL DEFAULT 30",
	},
	{
		name: "auth_max_failed_attempts",
		sql: "ALTER TABLE system_config ADD COLUMN auth_max_failed_attempts INTEGER NOT NULL DEFAULT 5",
	},
	{
		name: "auth_lockout_minutes",
		sql: "ALTER TABLE system_config ADD COLUMN auth_lockout_minutes INTEGER NOT NULL DEFAULT 15",
	},
	{
		name: "auth_allow_multi_session",
		sql: "ALTER TABLE system_config ADD COLUMN auth_allow_multi_session INTEGER NOT NULL DEFAULT 1",
	},
] as const;

function getDefaultPayload(now: string): SystemConfig {
	return {
		id: DEFAULT_SYSTEM_CONFIG_ID,
		default_can_create_branches: 1,
		default_max_branches_per_store: 5,
		created_at: now,
		updated_at: now,
		default_session_limit: 3,
		store_logo_max_size_mb: 5,
		store_logo_auto_resize: 1,
		store_logo_resize_max_width: 1200,
		payment_max_accounts_per_store: 5,
		payment_require_slip_for_lao_qr: 1,
		app_latest_build: 1,
		app_min_required_build: 1,
		app_update_message: null,
		auth_access_token_ttl_minutes: 15,
		auth_refresh_token_ttl_days: 7,
		auth_remember_me_refresh_ttl_days: 30,
		auth_max_failed_attempts: 5,
		auth_lockout_minutes: 15,
		auth_allow_multi_session: 1,
	};
}

export class SystemConfigInterface {
	private static async ensurePolicyColumns(): Promise<void> {
		const db = DbConn.getClient();
		const pragmaResult = await db.execute("PRAGMA table_info(system_config)");
		const existingColumns = new Set(
			pragmaResult.rows
				.map((row) => String(row.name || "")),
		);

		for (const column of AUTH_POLICY_COLUMNS) {
			if (existingColumns.has(column.name)) continue;
			await db.execute(column.sql);
		}
	}

	static async getConfig(): Promise<SystemConfig> {
		await SystemConfigInterface.ensurePolicyColumns();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT *
				FROM system_config
				ORDER BY updated_at DESC
				LIMIT 1
			`,
		});

		if (result.rows.length > 0) {
			return result.rows[0] as unknown as SystemConfig;
		}

		const now = new Date().toISOString();
		const fallback = getDefaultPayload(now);

		await db.execute({
			sql: `
				INSERT INTO system_config (
					id,
					default_can_create_branches,
					default_max_branches_per_store,
					created_at,
					updated_at,
					default_session_limit,
					store_logo_max_size_mb,
					store_logo_auto_resize,
					store_logo_resize_max_width,
					payment_max_accounts_per_store,
					payment_require_slip_for_lao_qr,
					app_latest_build,
					app_min_required_build,
					app_update_message,
					auth_access_token_ttl_minutes,
					auth_refresh_token_ttl_days,
					auth_remember_me_refresh_ttl_days,
					auth_max_failed_attempts,
					auth_lockout_minutes,
					auth_allow_multi_session
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
			args: [
				fallback.id,
				fallback.default_can_create_branches,
				fallback.default_max_branches_per_store,
				fallback.created_at,
				fallback.updated_at,
				fallback.default_session_limit,
				fallback.store_logo_max_size_mb,
				fallback.store_logo_auto_resize,
				fallback.store_logo_resize_max_width,
				fallback.payment_max_accounts_per_store,
				fallback.payment_require_slip_for_lao_qr,
				fallback.app_latest_build,
				fallback.app_min_required_build,
				fallback.app_update_message,
				fallback.auth_access_token_ttl_minutes,
				fallback.auth_refresh_token_ttl_days,
				fallback.auth_remember_me_refresh_ttl_days,
				fallback.auth_max_failed_attempts,
				fallback.auth_lockout_minutes,
				fallback.auth_allow_multi_session,
			],
		});

		return fallback;
	}

	static async updateConfig(data: SystemConfigUpdateInput): Promise<SystemConfig> {
		const current = await SystemConfigInterface.getConfig();
		const keys = Object.keys(data);

		if (keys.length === 0) {
			return current;
		}

		const setClause = [
			...keys.map((key) => `${key} = ?`),
			"updated_at = ?",
		].join(", ");

		const values = Object.values(data);
		const updatedAt = new Date().toISOString();
		const db = DbConn.getClient();

		await db.execute({
			sql: `UPDATE system_config SET ${setClause} WHERE id = ?`,
			args: [ ...values, updatedAt, current.id ],
		});

		return SystemConfigInterface.getConfig();
	}
}
