import axios, { AxiosError, AxiosResponse } from "axios";

import { Log } from "@utils/Log";
import { Utils } from "@utils/Utils";

export class ProviderMiddleware {
	protected static async axiosHandler<T>(
		requestId: string,
		logName: string,
		axiosPromise: Promise<AxiosResponse<T>>,
	): Promise<T> {
		const axiosRequestTime = new Date();
		try {
			const response = await axiosPromise;
			const axiosResponseTime = new Date();
			const axiosResponseDuration = (axiosResponseTime.getTime() - axiosRequestTime.getTime()) / 1000;

			Log.addLog(requestId, logName, {
				requestUrl: response.config.url,
				requestMethod: (response.config.method || "GET").toUpperCase(),
				requestBody: Utils.jsonStringParse(response.config.data),
				response: response.data,
				error: false,
				axiosRequestTime,
				axiosResponseTime,
				axiosResponseDuration,
			});

			return response.data;
		} catch (error) {
			const axiosResponseTime = new Date();
			const axiosResponseDuration = (axiosResponseTime.getTime() - axiosRequestTime.getTime()) / 1000;

			if (axios.isAxiosError(error)) {
				const axiosError = error as AxiosError;
				Log.addLog(requestId, logName, {
					requestUrl: axiosError.config?.url,
					requestMethod: (axiosError.config?.method || "GET").toUpperCase(),
					requestBody: Utils.jsonStringParse(axiosError.config?.data),
					error: true,
					axiosRequestTime,
					axiosResponseTime,
					axiosResponseDuration,
					errorResponse: axiosError.response
						? {
							data: axiosError.response.data,
							status: axiosError.response.status,
							statusText: axiosError.response.statusText,
						}
						: undefined,
				});
			} else {
				Log.addLog(requestId, logName, {
					error: true,
					axiosRequestTime,
					axiosResponseTime,
					axiosResponseDuration,
					errorTrack: error,
				});
			}

			throw error;
		}
	}

	protected static async customAxiosHandler<T>(
		requestId: string,
		subRequestId: string,
		logName: string,
		axiosPromise: Promise<AxiosResponse<T>>,
	): Promise<T> {
		const key = logName;
		const axiosRequestTime = new Date();
		try {
			const response = await axiosPromise;
			const axiosResponseTime = new Date();
			const axiosResponseDuration = (axiosResponseTime.getTime() - axiosRequestTime.getTime()) / 1000;

			Log.addLog(requestId, key, {
				[subRequestId]: {
					requestUrl: response.config.url,
					requestMethod: (response.config.method || "GET").toUpperCase(),
					requestBody: Utils.jsonStringParse(response.config.data),
					response: response.data,
					error: false,
					axiosRequestTime,
					axiosResponseTime,
					axiosResponseDuration,
				},
			});

			return response.data;
		} catch (error) {
			const axiosResponseTime = new Date();
			const axiosResponseDuration = (axiosResponseTime.getTime() - axiosRequestTime.getTime()) / 1000;

			if (axios.isAxiosError(error)) {
				const axiosError = error as AxiosError;
				Log.addLog(requestId, key, {
					[subRequestId]: {
						requestUrl: axiosError.config?.url,
						requestMethod: (axiosError.config?.method || "GET").toUpperCase(),
						requestBody: Utils.jsonStringParse(axiosError.config?.data),
						error: true,
						axiosRequestTime,
						axiosResponseTime,
						axiosResponseDuration,
						errorResponse: axiosError.response
							? {
								data: axiosError.response.data,
								status: axiosError.response.status,
								statusText: axiosError.response.statusText,
							}
							: undefined,
					},
				});
			} else {
				Log.addLog(requestId, key, {
					[subRequestId]: {
						error: true,
						axiosRequestTime,
						axiosResponseTime,
						axiosResponseDuration,
						errorTrack: error,
					},
				});
			}

			throw error;
		}
	}
}
