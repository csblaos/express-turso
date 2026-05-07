import { NextFunction, Request, Response } from "express";

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

function minimizeResponseBody(body: unknown): unknown {
	if (Array.isArray(body)) return [ body.length ];
	if (!body || typeof body !== "object") return body;

	const obj = body as Record<string, unknown>;
	if (Array.isArray(obj.data)) {
		return {
			...obj,
			data: [ obj.data.length ],
		};
	}

	return body;
}

function cleanHeaders(
	headers: Request["headers"],
	excludeHeaders: Set<string>,
	standardHeaders: Set<string>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [ key, value ] of Object.entries(headers)) {
		const lowerKey = key.toLowerCase();
		if (excludeHeaders.has(lowerKey)) continue;
		if (standardHeaders.has(lowerKey)) continue;
		result[key] = value;
	}
	return result;
}

export class RequestMiddleware {
	static requestResponseLog(req: Request, res: Response, next: NextFunction): void {
		const requestId = (req.header("request-id") || uuid()).toString();
		req.requestId = requestId;
		res.setHeader("request-id", requestId);

		const secretKeys = toLowerSet(Config.secretParameters);
		const excludeHeaders = toLowerSet(Config.ExcludeHeadersFromLog);
		const standardHeaders = toLowerSet(Config.StandardHeadersFromLog);

		const requestTime = new Date();
		Log.logs[requestId] = {
			requestId,
			requestTime,
			method: req.method,
			path: req.originalUrl,
			params: req.params,
			query: redactSecrets(req.query, secretKeys) as Record<string, unknown>,
			body: {},
			headers: cleanHeaders(req.headers, excludeHeaders, standardHeaders),
			error: false,
			errorTrack: null,
		};

		const originalJson = res.json.bind(res) as (body?: unknown) => Response;
		res.json = ((body: unknown) => {
			const logEntry = Log.logs[requestId];
			if (logEntry) {
				logEntry.response = minimizeResponseBody(body);
			}

			return originalJson(body);
		}) as Response["json"];

		res.on("finish", () => {
			const logEntry = Log.logs[requestId];
			if (!logEntry) return;

			logEntry.responseStatus = res.statusCode;
			logEntry.responseTime = new Date();
			logEntry.responseDuration =
				(logEntry.responseTime.getTime() - requestTime.getTime()) / 1000;

			logEntry.params = req.params;
			logEntry.query = redactSecrets(req.query, secretKeys) as Record<string, unknown>;
			logEntry.body = redactSecrets(req.body, secretKeys);
			logEntry.headers = cleanHeaders(req.headers, excludeHeaders, standardHeaders);

			Log.printLog(requestId);
		});

		next();
	}
}
