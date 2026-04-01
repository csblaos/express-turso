export type ErrorFormat = {
	code: number;
	message: string;
	httpStatusCode?: number;
	seamlessStatusCode?: number;
	seamlessMessage?: string;
};

export const ErrorConfig = {
	RESPONSE_FORMAT: {
		BAD_REQUEST: {
			code: 400,
			message: "Bad request",
			httpStatusCode: 400,
		},
		NOT_FOUND: {
			code: 404,
			message: "Not found",
			httpStatusCode: 404,
		},
		UNAUTHORIZED: {
			code: 401,
			message: "Unauthorized",
			httpStatusCode: 401,
		},
		FORBIDDEN: {
			code: 403,
			message: "Forbidden",
			httpStatusCode: 403,
		},
		INTERNAL_SERVER_ERROR: {
			code: 500,
			message: "Internal server error",
			httpStatusCode: 500,
		},
	},
	DOMAIN: {
		STORE_NOT_FOUND: {
			code: 404_001,
			message: "Store not found",
			httpStatusCode: 404,
		},
		STORE_NAME_REQUIRED: {
			code: 400_001,
			message: "Store name required",
			httpStatusCode: 400,
		},
	},
};
