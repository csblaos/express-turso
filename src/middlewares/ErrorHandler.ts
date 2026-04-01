import { NextFunction, Request, Response } from "express";
import axios, { AxiosError } from "axios";

import { ErrorConfig } from "@configs/ErrorConfig";
import { ApiError } from "@middlewares/ApiError";
import { Log } from "@utils/Log";
import { Utils } from "@utils/Utils";

function isUpstreamCodeMessage(
	value: unknown,
): value is { code: number; message: string; httpStatusCode?: number } {
	if (!value || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return typeof obj.code === "number" && typeof obj.message === "string";
}

export class ErrorHandler {
	static errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
		void next;
		const requestId = req.requestId || "unknown";
		const logEntry = Log.logs[requestId];
		if (logEntry) {
			logEntry.error = true;
			logEntry.errorTrack =
				err instanceof Error ? err.stack || err.message : Utils.stringify(err);

			logEntry.isAxiosError = axios.isAxiosError(err);
			logEntry.isSequelizeError = false;

			if (axios.isAxiosError(err)) {
				const axiosError = err as AxiosError;
				logEntry.axiosErrors = {
					message: axiosError.message,
					request: {
						url: axiosError.config?.url,
						method: (axiosError.config?.method || "GET").toUpperCase(),
						data: Utils.jsonStringParse(axiosError.config?.data),
					},
					errorResponse: axiosError.response
						? {
							data: axiosError.response.data,
							status: axiosError.response.status,
							statusText: axiosError.response.statusText,
						}
						: undefined,
				};
			}
		}

		const isSeamless = Boolean(req.isSeamless);
		if (err && typeof err === "object") {
			(err as { isSeamless?: boolean }).isSeamless = isSeamless;
		}

		if (err instanceof ApiError) {
			const { statusCode, body } = ApiError.handler(
				new ApiError(
					{
						code: err.code,
						message: err.message,
						httpStatusCode: err.httpStatusCode,
						seamlessStatusCode: err.seamlessStatusCode,
						seamlessMessage: err.seamlessMessage,
					},
					isSeamless,
				),
			);

			res.status(statusCode).json(body);
			return;
		}

		if (!isSeamless) {
			if (axios.isAxiosError(err)) {
				const axiosError = err as AxiosError;
				const data = axiosError.response?.data;
				if (isUpstreamCodeMessage(data)) {
					const upstream = ApiError.CustomError(
						{
							code: data.code,
							message: data.message,
							httpStatusCode: axiosError.response?.status || 500,
						},
						false,
					);
					const { statusCode, body } = ApiError.handler(upstream);
					res.status(statusCode).json(body);
					return;
				}
			}

			if (isUpstreamCodeMessage(err)) {
				const upstream = ApiError.CustomError(
					{
						code: err.code,
						message: err.message,
						httpStatusCode: err.httpStatusCode || 500,
					},
					false,
				);
				const { statusCode, body } = ApiError.handler(upstream);
				res.status(statusCode).json(body);
				return;
			}
		}

		console.error(`[${requestId}]`, err);

		const { statusCode, body } = ApiError.handler(
			ApiError.CustomError(
				{
					...ErrorConfig.RESPONSE_FORMAT.INTERNAL_SERVER_ERROR,
				},
				isSeamless,
			),
		);
		res.status(statusCode).json(body);
	}
}
