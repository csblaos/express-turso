import http from "http";

import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { ENV } from "@configs/ENV";
import { DbConn } from "@connections/DbConn";
import { RedisConn } from "@connections/RedisConn";
import { SystemConfigInterface } from "@interfaces/SystemConfigInterface";
import { SystemAdminSecurityInterface } from "@interfaces/SystemAdminSecurityInterface";
import { SystemHealthHistory, type SystemHealthHistorySample } from "@utils/SystemHealthHistory";
import { SystemRuntimeTelemetry } from "@utils/SystemRuntimeTelemetry";

type SecurityHealthStatus = "healthy" | "degraded" | "down";

type SecurityHealth = {
	status: SecurityHealthStatus;
	latency_ms: number | null;
	message: string;
	checked_at: string;
	history: SystemHealthHistorySample[];
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
	recent_activity: {
		window_hours: number;
		password_resets: number;
		suspensions: number;
		role_changes: number;
		client_updates: number;
	};
	auth_telemetry: {
		window_hours: number;
		login_successes: number;
		login_failures: number;
		lockouts: number;
		suspended_blocks: number;
		total_auth_events: number;
		failure_pressure_percent: number;
	};
	warnings: string[];
};

function ms(startedAt: number): number {
	return Math.max(0, Date.now() - startedAt);
}

function hrtimeMs(startedAt: bigint): number {
	return Math.max(1, Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000));
}

function resolveStatusByLatency(latencyMs: number): SecurityHealthStatus {
	if (latencyMs <= 300) return "healthy";
	return "degraded";
}

export class SystemAdminSecurityComponent {
	private static readonly API_SELF_CHECK_TIMEOUT_MS = 1_500;

	private static async getApiSelfCheckHealth(nowIso: string): Promise<SecurityHealth> {
		const startedAt = process.hrtime.bigint();

		return new Promise((resolve) => {
			const req = http.get(
				{
					host: ENV.SERVER.SELF_CHECK_HOST,
					port: ENV.SERVER.PORT,
					path: "/healthz",
					timeout: SystemAdminSecurityComponent.API_SELF_CHECK_TIMEOUT_MS,
				},
				(res) => {
					res.resume();
					res.on("end", () => {
						const latency = hrtimeMs(startedAt);
						const statusCode = res.statusCode || 0;
						const status = statusCode >= 500
							? "down"
							: resolveStatusByLatency(latency);
						resolve({
							status,
							latency_ms: latency,
							message: `API self-check /healthz ${statusCode || "unknown"} (${latency}ms)`,
							checked_at: nowIso,
							history: SystemHealthHistory.read("api"),
						});
					});
				},
			);

			req.on("timeout", () => {
				req.destroy(new Error("API health check timeout"));
			});

			req.on("error", (error) => {
				resolve({
					status: "down",
					latency_ms: hrtimeMs(startedAt),
					message: error instanceof Error ? error.message : "API health check failed",
					checked_at: nowIso,
					history: SystemHealthHistory.read("api"),
				});
			});
		});
	}

	private static async getApiHealth(nowIso: string): Promise<SecurityHealth> {
		return SystemAdminSecurityComponent.getApiSelfCheckHealth(nowIso);
	}

	private static async getDbHealth(nowIso: string): Promise<SecurityHealth> {
		if (!DbConn.isConnected()) {
			return {
				status: "down",
				latency_ms: null,
				message: "Database client is not connected",
				checked_at: nowIso,
				history: SystemHealthHistory.read("db"),
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
				history: SystemHealthHistory.read("db"),
			};
		} catch (error) {
			return {
				status: "down",
				latency_ms: ms(startedAt),
				message: error instanceof Error ? error.message : "Database ping failed",
				checked_at: nowIso,
				history: SystemHealthHistory.read("db"),
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
				history: SystemHealthHistory.read("redis"),
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
				history: SystemHealthHistory.read("redis"),
			};
		} catch (error) {
			return {
				status: "down",
				latency_ms: ms(startedAt),
				message: error instanceof Error ? error.message : "Redis ping failed",
				checked_at: nowIso,
				history: SystemHealthHistory.read("redis"),
			};
		}
	}

	static async getSnapshot(requestId: string): Promise<SecuritySnapshot> {
		void requestId;
		const checkedAt = new Date().toISOString();
		const recentWindowHours = 24;
		const recentSince = new Date(Date.now() - recentWindowHours * 60 * 60 * 1000).toISOString();
		const isDefaultJwtSecret = ENV.AUTH.JWT_SECRET === "dev-jwt-secret-change-me";

		const [
			apiHealth,
			dbHealth,
			redisHealth,
			authConfig,
			summary,
			passwordResets,
			suspensions,
			roleChanges,
			clientUpdates,
		] = await Promise.all([
			SystemAdminSecurityComponent.getApiHealth(checkedAt),
			SystemAdminSecurityComponent.getDbHealth(checkedAt),
			SystemAdminSecurityComponent.getRedisHealth(checkedAt),
			SystemConfigInterface.getConfig(),
			SystemAdminSecurityInterface.getSummaryCounts(),
			AuditEventInterface.countSince({
				since: recentSince,
				actions: [ "reset_client_password", "reset_store_member_password" ],
			}),
			AuditEventInterface.countSince({
				since: recentSince,
				scope: "system_admin",
				actions: [ "suspend_client_account", "activate_client_account" ],
			}),
			AuditEventInterface.countSince({
				since: recentSince,
				scope: "settings",
				actions: [ "create_role", "update_role", "delete_role" ],
			}),
			AuditEventInterface.countSince({
				since: recentSince,
				scope: "system_admin",
				actions: [ "update_client_account" ],
			}),
		]);
		const authTelemetry = SystemRuntimeTelemetry.getAuthSummary();

		const warnings: string[] = [];
		if (isDefaultJwtSecret) warnings.push("JWT secret ยังเป็นค่า default");
		if (ENV.AUTH.JWT_SECRET.length < 24) warnings.push("JWT secret ควรยาวมากกว่า 24 ตัวอักษร");
		if (apiHealth.status !== "healthy") warnings.push(`API status: ${apiHealth.status}`);
		if (dbHealth.status !== "healthy") warnings.push(`DB status: ${dbHealth.status}`);
		if (redisHealth.status !== "healthy") warnings.push(`Redis status: ${redisHealth.status}`);
		if (summary.users_without_password_hash > 0) warnings.push(`Users ไม่มี password hash: ${summary.users_without_password_hash}`);
		if (summary.users_suspended > 0) warnings.push(`Users ถูก suspended: ${summary.users_suspended}`);
		if (authConfig.auth_max_failed_attempts > 10) warnings.push("max failed attempts สูงเกินแนะนำ (มากกว่า 10)");
		if (authConfig.auth_lockout_minutes < 5) warnings.push("lockout minutes ต่ำเกินแนะนำ (น้อยกว่า 5)");
		if (passwordResets > 10) warnings.push(`Password resets 24h: ${passwordResets}`);
		if (authTelemetry.lockouts > 0) warnings.push(`Account lockouts 24h: ${authTelemetry.lockouts}`);

		const services = {
			api: apiHealth,
			db: dbHealth,
			redis: redisHealth,
		};

		SystemHealthHistory.record({
			api: {
				status: services.api.status,
				latency_ms: services.api.latency_ms,
				checked_at: services.api.checked_at,
			},
			db: {
				status: services.db.status,
				latency_ms: services.db.latency_ms,
				checked_at: services.db.checked_at,
			},
			redis: {
				status: services.redis.status,
				latency_ms: services.redis.latency_ms,
				checked_at: services.redis.checked_at,
			},
		});

		services.api.history = SystemHealthHistory.read("api");
		services.db.history = SystemHealthHistory.read("db");
		services.redis.history = SystemHealthHistory.read("redis");

		return {
			checked_at: checkedAt,
			services,
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
			recent_activity: {
				window_hours: recentWindowHours,
				password_resets: passwordResets,
				suspensions,
				role_changes: roleChanges,
				client_updates: clientUpdates,
			},
			auth_telemetry: authTelemetry,
			warnings,
		};
	}
}
