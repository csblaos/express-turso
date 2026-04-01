import { ErrorConfig, ErrorFormat } from "@configs/ErrorConfig";

export class ApiError extends Error {
	readonly code: number;
	readonly httpStatusCode: number;
	readonly seamlessStatusCode?: number;
	readonly seamlessMessage?: string;
	readonly isSeamless: boolean;

	constructor(format: ErrorFormat, isSeamless = false) {
		super(format.message);
		this.code = format.code;
		this.httpStatusCode = format.httpStatusCode || 500;
		this.seamlessStatusCode = format.seamlessStatusCode;
		this.seamlessMessage = format.seamlessMessage;
		this.isSeamless = isSeamless;
		Object.setPrototypeOf(this, ApiError.prototype);
	}

	static handler(err: ApiError): { statusCode: number; body: Record<string, unknown> } {
		if (err.isSeamless) {
			return {
				statusCode: 200,
				body: {
					status: err.seamlessStatusCode || err.httpStatusCode,
					desc: err.seamlessMessage || err.message,
				},
			};
		}

		return {
			statusCode: err.httpStatusCode,
			body: {
				code: err.code,
				message: err.message,
			},
		};
	}

	static BadRequestError(message?: string): ApiError {
		return new ApiError(
			{
				...ErrorConfig.RESPONSE_FORMAT.BAD_REQUEST,
				message: message || ErrorConfig.RESPONSE_FORMAT.BAD_REQUEST.message,
			},
		);
	}

	static NotFoundError(message?: string): ApiError {
		return new ApiError(
			{
				...ErrorConfig.RESPONSE_FORMAT.NOT_FOUND,
				message: message || ErrorConfig.RESPONSE_FORMAT.NOT_FOUND.message,
			},
		);
	}

	static UnauthorizedError(message?: string): ApiError {
		return new ApiError(
			{
				...ErrorConfig.RESPONSE_FORMAT.UNAUTHORIZED,
				message: message || ErrorConfig.RESPONSE_FORMAT.UNAUTHORIZED.message,
			},
		);
	}

	static ForbiddenError(message?: string): ApiError {
		return new ApiError(
			{
				...ErrorConfig.RESPONSE_FORMAT.FORBIDDEN,
				message: message || ErrorConfig.RESPONSE_FORMAT.FORBIDDEN.message,
			},
		);
	}

	static InternalError(message?: string): ApiError {
		return new ApiError(
			{
				...ErrorConfig.RESPONSE_FORMAT.INTERNAL_SERVER_ERROR,
				message: message || ErrorConfig.RESPONSE_FORMAT.INTERNAL_SERVER_ERROR.message,
			},
		);
	}

	static CustomError(format: ErrorFormat, isSeamless = false): ApiError {
		return new ApiError(format, isSeamless);
	}
}
