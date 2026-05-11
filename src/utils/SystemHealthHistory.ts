type ServiceHealthStatus = "healthy" | "degraded" | "down";

export type SystemHealthHistorySample = {
	status: ServiceHealthStatus;
	latency_ms: number | null;
	checked_at: string;
};

type SystemHealthHistoryKey = "api" | "db" | "redis";

const MAX_SAMPLES = 24;

export class SystemHealthHistory {
	private static readonly history: Record<SystemHealthHistoryKey, SystemHealthHistorySample[]> = {
		api: [],
		db: [],
		redis: [],
	};

	private static push(key: SystemHealthHistoryKey, sample: SystemHealthHistorySample): void {
		const series = SystemHealthHistory.history[key];
		series.push(sample);
		if (series.length > MAX_SAMPLES) {
			series.splice(0, series.length - MAX_SAMPLES);
		}
	}

	static record(serviceHealth: Record<SystemHealthHistoryKey, SystemHealthHistorySample>): void {
		SystemHealthHistory.push("api", serviceHealth.api);
		SystemHealthHistory.push("db", serviceHealth.db);
		SystemHealthHistory.push("redis", serviceHealth.redis);
	}

	static read(key: SystemHealthHistoryKey): SystemHealthHistorySample[] {
		return [ ...SystemHealthHistory.history[key] ];
	}
}
