import { DbConn } from "@connections/DbConn";
import { RedisConn } from "@connections/RedisConn";
import { SystemAdminMonitoringInterface } from "@interfaces/SystemAdminMonitoringInterface";

type ServiceHealthStatus = "healthy" | "degraded" | "down";

type ServiceHealth = {
	status: ServiceHealthStatus;
	latency_ms: number | null;
	message: string;
	checked_at: string;
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
	warnings: string[];
};

function ms(startedAt: number): number {
	return Math.max(0, Date.now() - startedAt);
}

function resolveStatusByLatency(latencyMs: number): ServiceHealthStatus {
	if (latencyMs <= 300) return "healthy";
	if (latencyMs <= 1200) return "degraded";
	return "down";
}

function mb(bytes: number): number {
	return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export class SystemAdminMonitoringComponent {
	private static getApiHealth(nowIso: string): ServiceHealth {
		return {
			status: "healthy",
			latency_ms: 0,
			message: "API process is running",
			checked_at: nowIso,
		};
	}

	private static async getDbHealth(nowIso: string): Promise<ServiceHealth> {
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

	private static async getRedisHealth(nowIso: string): Promise<ServiceHealth> {
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

	static async getSnapshot(requestId: string): Promise<MonitoringSnapshot> {
		void requestId;
		const checkedAt = new Date().toISOString();
		const memoryUsage = process.memoryUsage();

		const [ dbHealth, redisHealth, summary ] = await Promise.all([
			SystemAdminMonitoringComponent.getDbHealth(checkedAt),
			SystemAdminMonitoringComponent.getRedisHealth(checkedAt),
			SystemAdminMonitoringInterface.getSummaryCounts(),
		]);

		const warnings: string[] = [];
		if (dbHealth.status !== "healthy") warnings.push(`DB status: ${dbHealth.status}`);
		if (redisHealth.status !== "healthy") warnings.push(`Redis status: ${redisHealth.status}`);
		if (summary.users_suspended > 0) warnings.push(`Suspended users: ${summary.users_suspended}`);

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
			services: {
				api: SystemAdminMonitoringComponent.getApiHealth(checkedAt),
				db: dbHealth,
				redis: redisHealth,
			},
			summary,
			warnings,
		};
	}
}
