type RequestTelemetrySample = {
	at: number;
	statusCode: number;
	path: string;
	method: string;
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

function trimByWindow<T extends { at: number }>(samples: T[], maxCount: number): void {
	const cutoff = Date.now() - WINDOW_MS;
	while (samples.length && samples[0].at < cutoff) {
		samples.shift();
	}
	if (samples.length > maxCount) {
		samples.splice(0, samples.length - maxCount);
	}
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
