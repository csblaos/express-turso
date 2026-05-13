import http from "http";

import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { ENV } from "@configs/ENV";
import { DbConn } from "@connections/DbConn";
import { RedisConn } from "@connections/RedisConn";
import { SystemAdminMonitoringInterface } from "@interfaces/SystemAdminMonitoringInterface";
import { SystemHealthHistory, type SystemHealthHistorySample } from "@utils/SystemHealthHistory";
import { SystemRuntimeTelemetry } from "@utils/SystemRuntimeTelemetry";

type ServiceHealthStatus = "healthy" | "degraded" | "down";

type ServiceHealth = {
	status: ServiceHealthStatus;
	latency_ms: number | null;
	message: string;
	checked_at: string;
	history: SystemHealthHistorySample[];
};

type MonitoringSnapshot = {
	checked_at: string;
	runtime: {
		uptime_seconds: number;
		node_version: string;
		platform: string;
		pid: number;
		memory: {
			rss_mb: number;
			heap_used_mb: number;
			heap_total_mb: number;
			external_mb: number;
		};
	};
	services: {
		api: ServiceHealth;
		db: ServiceHealth;
		redis: ServiceHealth;
	};
	summary: {
		users_total: number;
		users_active: number;
		users_suspended: number;
		stores_total: number;
		products_total: number;
		inventory_balances_total: number;
		purchase_orders_total: number;
		fb_connections_total: number;
		fb_connections_online: number;
		wa_connections_total: number;
		wa_connections_online: number;
		integrations_total: number;
	};
	recent_activity: {
		window_hours: number;
		admin_changes_total: number;
		client_changes: number;
		role_changes: number;
		member_changes: number;
		password_resets: number;
	};
	pos_performance: {
		window_hours: number;
		total_requests: number;
		avg_latency_ms: number;
		p95_latency_ms: number;
		slow_requests: number;
		slow_rate_percent: number;
		error_rate_percent: number;
		slow_threshold_ms: number;
		groups: Array<{
			id: string;
			label: string;
			request_count: number;
			avg_latency_ms: number;
		}>;
	};
	warnings: string[];
};

function ms(startedAt: number): number {
	return Math.max(0, Date.now() - startedAt);
}

function hrtimeMs(startedAt: bigint): number {
	return Math.max(1, Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000));
}

function resolveStatusByLatency(latencyMs: number): ServiceHealthStatus {
	if (latencyMs <= 300) return "healthy";
	return "degraded";
}

function mb(bytes: number): number {
	return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export class SystemAdminMonitoringComponent {
	private static readonly API_SELF_CHECK_TIMEOUT_MS = 1_500;

	private static async getApiSelfCheckHealth(nowIso: string): Promise<ServiceHealth> {
		const startedAt = process.hrtime.bigint();

		return new Promise((resolve) => {
			const req = http.get(
				{
					host: ENV.SERVER.SELF_CHECK_HOST,
					port: ENV.SERVER.PORT,
					path: "/healthz",
					timeout: SystemAdminMonitoringComponent.API_SELF_CHECK_TIMEOUT_MS,
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

	private static async getApiHealth(nowIso: string): Promise<ServiceHealth> {
		return SystemAdminMonitoringComponent.getApiSelfCheckHealth(nowIso);
	}

	private static async getDbHealth(nowIso: string): Promise<ServiceHealth> {
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

	private static async getRedisHealth(nowIso: string): Promise<ServiceHealth> {
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

	static async getSnapshot(requestId: string): Promise<MonitoringSnapshot> {
		void requestId;
		const checkedAt = new Date().toISOString();
		const recentWindowHours = 24;
		const recentSince = new Date(Date.now() - recentWindowHours * 60 * 60 * 1000).toISOString();
		const memoryUsage = process.memoryUsage();

		const [
			apiHealth,
			dbHealth,
			redisHealth,
			summary,
			adminChangesTotal,
			clientChanges,
			roleChanges,
			memberChanges,
			passwordResets,
		] = await Promise.all([
			SystemAdminMonitoringComponent.getApiHealth(checkedAt),
			SystemAdminMonitoringComponent.getDbHealth(checkedAt),
			SystemAdminMonitoringComponent.getRedisHealth(checkedAt),
			SystemAdminMonitoringInterface.getSummaryCounts(),
			AuditEventInterface.countSince({ since: recentSince, scopes: [ "system_admin", "settings" ] }),
			AuditEventInterface.countSince({
				since: recentSince,
				scope: "system_admin",
				actions: [ "create_client_account", "update_client_account", "suspend_client_account", "activate_client_account" ],
			}),
			AuditEventInterface.countSince({
				since: recentSince,
				scope: "settings",
				actions: [ "create_role", "update_role", "delete_role" ],
			}),
			AuditEventInterface.countSince({
				since: recentSince,
				scope: "settings",
				actions: [ "create_store_member" ],
			}),
			AuditEventInterface.countSince({
				since: recentSince,
				actions: [ "reset_client_password", "reset_store_member_password" ],
			}),
		]);
		const posPerformance = SystemRuntimeTelemetry.getPosPerformanceSummary();

		const warnings: string[] = [];
		if (apiHealth.status !== "healthy") warnings.push(`API status: ${apiHealth.status}`);
		if (dbHealth.status !== "healthy") warnings.push(`DB status: ${dbHealth.status}`);
		if (redisHealth.status !== "healthy") warnings.push(`Redis status: ${redisHealth.status}`);
		if (summary.users_suspended > 0) warnings.push(`Suspended users: ${summary.users_suspended}`);
		if ((summary.fb_connections_total - summary.fb_connections_online) > 0) warnings.push(`FB offline: ${summary.fb_connections_total - summary.fb_connections_online}`);
		if ((summary.wa_connections_total - summary.wa_connections_online) > 0) warnings.push(`WA offline: ${summary.wa_connections_total - summary.wa_connections_online}`);
		if (posPerformance.slow_rate_percent > 20 && posPerformance.total_requests > 0) warnings.push(`POS slow rate 24h: ${posPerformance.slow_rate_percent}%`);
		if (posPerformance.error_rate_percent > 0) warnings.push(`POS 5xx rate 24h: ${posPerformance.error_rate_percent}%`);

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
			runtime: {
				uptime_seconds: Math.floor(process.uptime()),
				node_version: process.version,
				platform: process.platform,
				pid: process.pid,
				memory: {
					rss_mb: mb(memoryUsage.rss),
					heap_used_mb: mb(memoryUsage.heapUsed),
					heap_total_mb: mb(memoryUsage.heapTotal),
					external_mb: mb(memoryUsage.external),
				},
			},
			services,
			summary,
			recent_activity: {
				window_hours: recentWindowHours,
				admin_changes_total: adminChangesTotal,
				client_changes: clientChanges,
				role_changes: roleChanges,
				member_changes: memberChanges,
				password_resets: passwordResets,
			},
			pos_performance: posPerformance,
			warnings,
		};
	}
}
