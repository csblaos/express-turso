import { ENV } from "@configs/ENV";
import { DbConn } from "@connections/DbConn";
import { RedisConn } from "@connections/RedisConn";
import { SystemConfigInterface } from "@interfaces/SystemConfigInterface";
import { SystemAdminSecurityInterface } from "@interfaces/SystemAdminSecurityInterface";

type SecurityHealthStatus = "healthy" | "degraded" | "down";

type SecurityHealth = {
	status: SecurityHealthStatus;
	latency_ms: number | null;
	message: string;
	checked_at: string;
};

type SecuritySnapshot = {
	checked_at: string;
	services: {
		api: SecurityHealth;
		db: SecurityHealth;
		redis: SecurityHealth;
	};
	auth_policy: {
		access_token_ttl_minutes: number;
		refresh_token_ttl_days: number;
		remember_me_refresh_ttl_days: number;
		max_failed_attempts: number;
		lockout_minutes: number;
		allow_multi_session: boolean;
		default_session_limit: number;
	};
	security: {
		jwt_secret_is_default: boolean;
		jwt_secret_length: number;
		node_env: string;
		redis_driver: string;
	};
	summary: {
		users_total: number;
		users_system_admin: number;
		users_superadmin: number;
		users_suspended: number;
		users_must_change_password: number;
		users_without_password_hash: number;
		stores_total: number;
		store_members_total: number;
	};
	warnings: string[];
};

function ms(startedAt: number): number {
	return Math.max(0, Date.now() - startedAt);
}

function resolveStatusByLatency(latencyMs: number): SecurityHealthStatus {
	if (latencyMs <= 300) return "healthy";
	if (latencyMs <= 1200) return "degraded";
	return "down";
}

export class SystemAdminSecurityComponent {
	private static getApiHealth(nowIso: string): SecurityHealth {
		return {
			status: "healthy",
			latency_ms: 0,
			message: "API process is running",
			checked_at: nowIso,
		};
	}

	private static async getDbHealth(nowIso: string): Promise<SecurityHealth> {
		if (!DbConn.isConnected()) {
			return {
				status: "down",
				latency_ms: null,
				message: "Database client is not connected",
				checked_at: nowIso,
			};
		}

		const startedAt = Date.now();
		try {
			await DbConn.getClient().execute("SELECT 1 AS ok");
			const latency = ms(startedAt);
			const status = resolveStatusByLatency(latency);
			return {
				status,
				latency_ms: latency,
				message: `Database ping OK (${latency}ms)`,
				checked_at: nowIso,
			};
		} catch (error) {
			return {
				status: "down",
				latency_ms: ms(startedAt),
				message: error instanceof Error ? error.message : "Database ping failed",
				checked_at: nowIso,
			};
		}
	}

	private static async getRedisHealth(nowIso: string): Promise<SecurityHealth> {
		if (!RedisConn.isConnected()) {
			return {
				status: "down",
				latency_ms: null,
				message: "Redis client is not connected",
				checked_at: nowIso,
			};
		}

		const startedAt = Date.now();
		try {
			const response = await RedisConn.ping();
			const latency = ms(startedAt);
			const status = resolveStatusByLatency(latency);
			return {
				status,
				latency_ms: latency,
				message: `Redis ping ${response || "OK"} (${latency}ms)`,
				checked_at: nowIso,
			};
		} catch (error) {
			return {
				status: "down",
				latency_ms: ms(startedAt),
				message: error instanceof Error ? error.message : "Redis ping failed",
				checked_at: nowIso,
			};
		}
	}

	static async getSnapshot(requestId: string): Promise<SecuritySnapshot> {
		void requestId;
		const checkedAt = new Date().toISOString();
		const isDefaultJwtSecret = ENV.AUTH.JWT_SECRET === "dev-jwt-secret-change-me";

		const [ dbHealth, redisHealth, authConfig, summary ] = await Promise.all([
			SystemAdminSecurityComponent.getDbHealth(checkedAt),
			SystemAdminSecurityComponent.getRedisHealth(checkedAt),
			SystemConfigInterface.getConfig(),
			SystemAdminSecurityInterface.getSummaryCounts(),
		]);

		const warnings: string[] = [];
		if (isDefaultJwtSecret) warnings.push("JWT secret ยังเป็นค่า default");
		if (ENV.AUTH.JWT_SECRET.length < 24) warnings.push("JWT secret ควรยาวมากกว่า 24 ตัวอักษร");
		if (dbHealth.status !== "healthy") warnings.push(`DB status: ${dbHealth.status}`);
		if (redisHealth.status !== "healthy") warnings.push(`Redis status: ${redisHealth.status}`);
		if (summary.users_without_password_hash > 0) warnings.push(`Users ไม่มี password hash: ${summary.users_without_password_hash}`);
		if (summary.users_suspended > 0) warnings.push(`Users ถูก suspended: ${summary.users_suspended}`);
		if (authConfig.auth_max_failed_attempts > 10) warnings.push("max failed attempts สูงเกินแนะนำ (มากกว่า 10)");
		if (authConfig.auth_lockout_minutes < 5) warnings.push("lockout minutes ต่ำเกินแนะนำ (น้อยกว่า 5)");

		return {
			checked_at: checkedAt,
			services: {
				api: SystemAdminSecurityComponent.getApiHealth(checkedAt),
				db: dbHealth,
				redis: redisHealth,
			},
			auth_policy: {
				access_token_ttl_minutes: authConfig.auth_access_token_ttl_minutes,
				refresh_token_ttl_days: authConfig.auth_refresh_token_ttl_days,
				remember_me_refresh_ttl_days: authConfig.auth_remember_me_refresh_ttl_days,
				max_failed_attempts: authConfig.auth_max_failed_attempts,
				lockout_minutes: authConfig.auth_lockout_minutes,
				allow_multi_session: Boolean(authConfig.auth_allow_multi_session),
				default_session_limit: authConfig.default_session_limit,
			},
			security: {
				jwt_secret_is_default: isDefaultJwtSecret,
				jwt_secret_length: ENV.AUTH.JWT_SECRET.length,
				node_env: ENV.SERVER.NODE_ENV,
				redis_driver: ENV.REDIS.DRIVER,
			},
			summary,
			warnings,
		};
	}
}

