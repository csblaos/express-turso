type PosRequestTelemetrySample = {
	at: number;
	statusCode: number;
	groupId: string;
	durationMs: number;
};

type PosRouteGroup = {
	id: string;
	label: string;
	prefixes: string[];
};

type AuthTelemetryType =
	| "login_success"
	| "login_failure"
	| "account_locked"
	| "login_blocked_suspended";

type AuthTelemetrySample = {
	at: number;
	type: AuthTelemetryType;
};

const AUTH_HOURS_WINDOW = 24;
const POS_HOURS_WINDOW = 1;
const MAX_POS_REQUEST_SAMPLES = 100;
const MAX_AUTH_SAMPLES = 2000;
const AUTH_WINDOW_MS = AUTH_HOURS_WINDOW * 60 * 60 * 1000;
const POS_WINDOW_MS = POS_HOURS_WINDOW * 60 * 60 * 1000;
const POS_SLOW_REQUEST_THRESHOLD_MS = 800;
const POS_ROUTE_GROUPS: PosRouteGroup[] = [
	{ id: "orders", label: "Orders", prefixes: [ "/api/orders" ] },
	{ id: "products", label: "Products", prefixes: [ "/api/products", "/api/product-units", "/api/product-categories", "/api/units" ] },
	{ id: "inventory", label: "Inventory", prefixes: [ "/api/inventory" ] },
	{ id: "purchase-orders", label: "Purchase orders", prefixes: [ "/api/purchase-orders" ] },
	{ id: "stores", label: "Stores", prefixes: [ "/api/stores" ] },
];

function trimAuthSamples(samples: AuthTelemetrySample[]): void {
	const cutoff = Date.now() - AUTH_WINDOW_MS;
	while (samples.length && samples[0].at < cutoff) {
		samples.shift();
	}
	if (samples.length > MAX_AUTH_SAMPLES) {
		samples.splice(0, samples.length - MAX_AUTH_SAMPLES);
	}
}

function percentile(values: number[], ratio: number): number {
	if (!values.length) return 0;
	const sorted = [ ...values ].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
	return sorted[index];
}

function resolvePosRouteGroup(path: string): PosRouteGroup | null {
	return POS_ROUTE_GROUPS.find((group) => group.prefixes.some((prefix) => path.startsWith(prefix))) || null;
}

export class SystemRuntimeTelemetry {
	private static readonly posRequestSamples: PosRequestTelemetrySample[] = [];
	private static readonly authSamples: AuthTelemetrySample[] = [];
	private static posRequestLastResetAt: number | null = null;

	private static trimPosRequestSamples(now: number): void {
		const cutoff = now - POS_WINDOW_MS;
		while (SystemRuntimeTelemetry.posRequestSamples.length && SystemRuntimeTelemetry.posRequestSamples[0].at < cutoff) {
			SystemRuntimeTelemetry.posRequestSamples.shift();
		}
		if (SystemRuntimeTelemetry.posRequestSamples.length > MAX_POS_REQUEST_SAMPLES) {
			SystemRuntimeTelemetry.posRequestSamples.splice(0, SystemRuntimeTelemetry.posRequestSamples.length - MAX_POS_REQUEST_SAMPLES);
		}
		if (!SystemRuntimeTelemetry.posRequestSamples.length) {
			SystemRuntimeTelemetry.posRequestLastResetAt = null;
		}
	}

	static recordRequest(sample: {
		statusCode: number;
		path: string;
		method?: string;
		durationMs: number;
	}): void {
		void sample.method;
		const group = resolvePosRouteGroup(sample.path);
		if (!group) return;

		const now = Date.now();
		SystemRuntimeTelemetry.trimPosRequestSamples(now);
		if (!SystemRuntimeTelemetry.posRequestSamples.length) {
			SystemRuntimeTelemetry.posRequestLastResetAt = now;
		}
		SystemRuntimeTelemetry.posRequestSamples.push({
			at: now,
			statusCode: sample.statusCode,
			groupId: group.id,
			durationMs: sample.durationMs,
		});
		SystemRuntimeTelemetry.trimPosRequestSamples(now);
	}

	static recordAuthEvent(type: AuthTelemetryType): void {
		SystemRuntimeTelemetry.authSamples.push({
			at: Date.now(),
			type,
		});
		trimAuthSamples(SystemRuntimeTelemetry.authSamples);
	}

	static getPosPerformanceSummary() {
		const now = Date.now();
		SystemRuntimeTelemetry.trimPosRequestSamples(now);
		const samples = SystemRuntimeTelemetry.posRequestSamples;
		const total_requests = samples.length;
		const durations = samples.map((sample) => sample.durationMs);
		const avg_latency_ms = total_requests > 0
			? Math.round(durations.reduce((sum, value) => sum + value, 0) / total_requests)
			: 0;
		const p95_latency_ms = total_requests > 0
			? percentile(durations, 0.95)
			: 0;
		const slow_requests = samples.filter((sample) => sample.durationMs > POS_SLOW_REQUEST_THRESHOLD_MS).length;
		const slow_rate_percent = total_requests > 0
			? Math.round((slow_requests / total_requests) * 100)
			: 0;
		const error_requests = samples.filter((sample) => sample.statusCode >= 500).length;
		const error_rate_percent = total_requests > 0
			? Math.round((error_requests / total_requests) * 100)
			: 0;

		const groups = POS_ROUTE_GROUPS.map((group) => {
			const groupSamples = samples.filter((sample) => sample.groupId === group.id);
			const request_count = groupSamples.length;
			const groupAvgLatency = request_count > 0
				? Math.round(groupSamples.reduce((sum, sample) => sum + sample.durationMs, 0) / request_count)
				: 0;
			return {
				id: group.id,
				label: group.label,
				request_count,
				avg_latency_ms: groupAvgLatency,
			};
		}).filter((group) => group.request_count > 0);

		return {
			window_hours: POS_HOURS_WINDOW,
			sample_limit: MAX_POS_REQUEST_SAMPLES,
			last_reset_at: SystemRuntimeTelemetry.posRequestLastResetAt
				? new Date(SystemRuntimeTelemetry.posRequestLastResetAt).toISOString()
				: null,
			total_requests,
			avg_latency_ms,
			p95_latency_ms,
			slow_requests,
			slow_rate_percent,
			error_rate_percent,
			slow_threshold_ms: POS_SLOW_REQUEST_THRESHOLD_MS,
			groups,
		};
	}

	static getAuthSummary(windowHours = AUTH_HOURS_WINDOW) {
		trimAuthSamples(SystemRuntimeTelemetry.authSamples);
		const cutoff = Date.now() - (windowHours * 60 * 60 * 1000);
		const samples = SystemRuntimeTelemetry.authSamples.filter((sample) => sample.at >= cutoff);
		const login_successes = samples.filter((sample) => sample.type === "login_success").length;
		const login_failures = samples.filter((sample) => sample.type === "login_failure").length;
		const lockouts = samples.filter((sample) => sample.type === "account_locked").length;
		const suspended_blocks = samples.filter((sample) => sample.type === "login_blocked_suspended").length;
		const total_auth_events = samples.length;
		const failure_pressure_percent = total_auth_events > 0
			? Math.round(((login_failures + lockouts + suspended_blocks) / total_auth_events) * 100)
			: 0;

		return {
			window_hours: windowHours,
			login_successes,
			login_failures,
			lockouts,
			suspended_blocks,
			total_auth_events,
			failure_pressure_percent,
		};
	}
}
