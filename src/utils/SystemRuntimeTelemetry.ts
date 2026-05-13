type RequestTelemetrySample = {
	at: number;
	statusCode: number;
	path: string;
	method: string;
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

const HOURS_WINDOW = 24;
const MAX_REQUEST_SAMPLES = 5000;
const MAX_AUTH_SAMPLES = 2000;
const WINDOW_MS = HOURS_WINDOW * 60 * 60 * 1000;
const POS_SLOW_REQUEST_THRESHOLD_MS = 800;
const POS_ROUTE_GROUPS: PosRouteGroup[] = [
	{ id: "orders", label: "Orders", prefixes: [ "/api/orders" ] },
	{ id: "products", label: "Products", prefixes: [ "/api/products", "/api/product-units", "/api/product-categories", "/api/units" ] },
	{ id: "inventory", label: "Inventory", prefixes: [ "/api/inventory" ] },
	{ id: "purchase-orders", label: "Purchase orders", prefixes: [ "/api/purchase-orders" ] },
	{ id: "stores", label: "Stores", prefixes: [ "/api/stores" ] },
];

function trimByWindow<T extends { at: number }>(samples: T[], maxCount: number): void {
	const cutoff = Date.now() - WINDOW_MS;
	while (samples.length && samples[0].at < cutoff) {
		samples.shift();
	}
	if (samples.length > maxCount) {
		samples.splice(0, samples.length - maxCount);
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
	private static readonly requestSamples: RequestTelemetrySample[] = [];
	private static readonly authSamples: AuthTelemetrySample[] = [];

	static recordRequest(sample: Omit<RequestTelemetrySample, "at">): void {
		SystemRuntimeTelemetry.requestSamples.push({
			at: Date.now(),
			...sample,
		});
		trimByWindow(SystemRuntimeTelemetry.requestSamples, MAX_REQUEST_SAMPLES);
	}

	static recordAuthEvent(type: AuthTelemetryType): void {
		SystemRuntimeTelemetry.authSamples.push({
			at: Date.now(),
			type,
		});
		trimByWindow(SystemRuntimeTelemetry.authSamples, MAX_AUTH_SAMPLES);
	}

	static getRequestSummary(windowHours = HOURS_WINDOW) {
		const cutoff = Date.now() - (windowHours * 60 * 60 * 1000);
		const samples = SystemRuntimeTelemetry.requestSamples.filter((sample) => sample.at >= cutoff);
		const total_requests = samples.length;
		const success_2xx = samples.filter((sample) => sample.statusCode >= 200 && sample.statusCode < 300).length;
		const client_errors_4xx = samples.filter((sample) => sample.statusCode >= 400 && sample.statusCode < 500).length;
		const server_errors_5xx = samples.filter((sample) => sample.statusCode >= 500).length;
		const error_rate_percent = total_requests > 0
			? Math.round(((client_errors_4xx + server_errors_5xx) / total_requests) * 100)
			: 0;

		return {
			window_hours: windowHours,
			total_requests,
			success_2xx,
			client_errors_4xx,
			server_errors_5xx,
			error_rate_percent,
		};
	}

	static getLatestRequestSample(maxAgeMs = 60_000): RequestTelemetrySample | null {
		const cutoff = Date.now() - maxAgeMs;
		for (let index = SystemRuntimeTelemetry.requestSamples.length - 1; index >= 0; index -= 1) {
			const sample = SystemRuntimeTelemetry.requestSamples[index];
			if (sample.at < cutoff) break;
			return sample;
		}
		return null;
	}

	static getPosPerformanceSummary(windowHours = HOURS_WINDOW) {
		const cutoff = Date.now() - (windowHours * 60 * 60 * 1000);
		const samples = SystemRuntimeTelemetry.requestSamples.filter((sample) => (
			sample.at >= cutoff && resolvePosRouteGroup(sample.path)
		));
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
			const groupSamples = samples.filter((sample) => group.prefixes.some((prefix) => sample.path.startsWith(prefix)));
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
			window_hours: windowHours,
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

	static getAuthSummary(windowHours = HOURS_WINDOW) {
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
