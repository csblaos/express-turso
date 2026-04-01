import { Config } from "@configs/Config";
import { Log } from "@utils/Log";
import { uuid } from "@utils/UUID";

function toLowerSet(values: string[]): Set<string> {
	return new Set(values.map((v) => v.toLowerCase()));
}

function redactSecrets(input: unknown, secretKeys: Set<string>): unknown {
	if (Array.isArray(input)) return input.map((item) => redactSecrets(item, secretKeys));
	if (!input || typeof input !== "object") return input;

	const obj = input as Record<string, unknown>;
	const result: Record<string, unknown> = {};

	for (const [ key, value ] of Object.entries(obj)) {
		if (secretKeys.has(key.toLowerCase())) {
			result[key] = "******";
		} else {
			result[key] = redactSecrets(value, secretKeys);
		}
	}

	return result;
}

export class AsyncFunction {
	static handler<TArgs extends unknown[]>(
		logName: string,
		fn: (requestId: string, lastRequestId: string, ...args: TArgs) => Promise<unknown>,
	): (lastRequestId: string, ...args: TArgs) => Promise<boolean> {
		return async (lastRequestId: string, ...args: TArgs) => {
			const requestId = uuid();
			const requestTime = new Date();
			const secretKeys = toLowerSet(Config.secretParameters);

			Log.logs[requestId] = {
				requestId,
				requestTime,
				method: "ASYNC",
				path: logName,
				params: { lastRequestId },
				query: {},
				body: redactSecrets({ args }, secretKeys),
				headers: {},
				error: false,
				errorTrack: null,
			};

			let ok = true;
			try {
				const response = await fn(requestId, lastRequestId, ...args);
				Log.addLog(requestId, "response", response);
				return true;
			} catch (error) {
				ok = false;
				Log.addLog(requestId, "error", true);
				Log.addLog(requestId, "errorTrack", error instanceof Error ? error.stack : error);
				return false;
			} finally {
				const logEntry = Log.logs[requestId];
				if (logEntry) {
					logEntry.responseStatus = ok ? 200 : 500;
					logEntry.responseTime = new Date();
					logEntry.responseDuration =
						(logEntry.responseTime.getTime() - requestTime.getTime()) / 1000;
				}
				Log.printLog(requestId);
			}
		};
	}
}
