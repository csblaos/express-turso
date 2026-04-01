import { Config } from "@configs/Config";
import { ENV } from "@configs/ENV";
import { Utils } from "@utils/Utils";

export type LogEntry = Record<string, unknown> & {
	requestId: string;

	requestTime: Date;
	method: string;
	path: string;
	params: unknown;
	query: Record<string, unknown>;
	body: unknown;
	headers: Record<string, unknown>;

	error: boolean;
	errorTrack: unknown | null;

	console?: string[];

	responseStatus?: number;
	response?: unknown;
	responseTime?: Date;
	responseDuration?: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	return Object.getPrototypeOf(value) === Object.prototype;
}

export class Log {
	static logs: Record<string, LogEntry> = {};

	static addLog(requestId: string, key: string, value: unknown): void {
		const logEntry = Log.logs[requestId];
		if (!logEntry) return;

		const existingValue = logEntry[key];
		if (isPlainObject(existingValue) && isPlainObject(value)) {
			logEntry[key] = { ...existingValue, ...value };
			return;
		}

		logEntry[key] = value;
	}

	static console(requestId: string, message: string): void {
		const logEntry = Log.logs[requestId];
		if (!logEntry) return;
		logEntry.console = logEntry.console || [];
		logEntry.console.push(message);
	}

	static printLog(requestId: string): void {
		const logEntry = Log.logs[requestId];
		if (!logEntry) return;

		try {
			if (ENV.SERVER.NODE_ENV === Config.DEVELOPMENT) {
				console.log(logEntry);
			} else {
				console.log(Utils.stringify(logEntry));
			}
		} finally {
			delete Log.logs[requestId];
		}
	}
}

