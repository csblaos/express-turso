import { Response } from "express";

type SuccessBase = {
	success: true;
	requestId: string;
};

type SuccessMessage = SuccessBase & {
	message: string;
};

type SuccessData<T> = SuccessBase & {
	data: T;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	return Object.getPrototypeOf(value) === Object.prototype;
}

export class SuccessHandler {
	static successResponse(requestId: string): SuccessBase;
	static successResponse(requestId: string, data: string): SuccessMessage;
	static successResponse<T extends Record<string, unknown>>(requestId: string, data: T): SuccessBase & T;
	static successResponse<T>(requestId: string, data: T): SuccessData<T>;
	static successResponse<T>(requestId: string, data?: T | string): SuccessBase | SuccessMessage | SuccessData<T> | (SuccessBase & Record<string, unknown>) {
		const base: SuccessBase = {
			success: true,
			requestId,
		};

		if (data === undefined) {
			return base;
		}

		if (typeof data === "string") {
			return {
				...base,
				message: data,
			};
		}

		if (isPlainObject(data)) {
			return {
				...base,
				...data,
			};
		}

		return {
			...base,
			data,
		};
	}

	static send(res: Response, requestId: string): Response;
	static send(res: Response, requestId: string, data: string): Response;
	static send<T>(res: Response, requestId: string, data: T): Response;
	static send<T>(res: Response, requestId: string, data?: T | string): Response {
		return res.status(200).send(SuccessHandler.successResponse(requestId, data as T | string));
	}

	static created<T>(res: Response, requestId: string, data: T): Response {
		return res.status(201).send(SuccessHandler.successResponse(requestId, data));
	}
}
