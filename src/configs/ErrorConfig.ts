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
		STORE_OWNER_REQUIRED: {
			code: 400_010,
			message: "Store owner is required",
			httpStatusCode: 400,
		},
		STORE_LIMIT_REACHED: {
			code: 403_002,
			message: "Store creation quota has been reached",
			httpStatusCode: 403,
		},
		PRODUCT_NOT_FOUND: {
			code: 404_002,
			message: "Product not found",
			httpStatusCode: 404,
		},
		PRODUCT_REQUIRED_FIELDS: {
			code: 400_002,
			message: "Product requires store_id, sku, name, base_unit_id, price_base, and cost_base",
			httpStatusCode: 400,
		},
		UNIT_NOT_FOUND: {
			code: 404_003,
			message: "Unit not found",
			httpStatusCode: 404,
		},
		UNIT_REQUIRED_FIELDS: {
			code: 400_003,
			message: "Unit requires code and name_th",
			httpStatusCode: 400,
		},
		PRODUCT_CATEGORY_NOT_FOUND: {
			code: 404_004,
			message: "Product category not found",
			httpStatusCode: 404,
		},
		PRODUCT_CATEGORY_REQUIRED_FIELDS: {
			code: 400_004,
			message: "Product category requires store_id and name",
			httpStatusCode: 400,
		},
		PRODUCT_UNIT_NOT_FOUND: {
			code: 404_005,
			message: "Product unit not found",
			httpStatusCode: 404,
		},
		PRODUCT_UNIT_REQUIRED_FIELDS: {
			code: 400_005,
			message: "Product unit requires product_id, unit_id, and multiplier_to_base",
			httpStatusCode: 400,
		},
		PRODUCT_UNIT_INVALID_MULTIPLIER: {
			code: 400_006,
			message: "Product unit multiplier_to_base must be greater than 0",
			httpStatusCode: 400,
		},
		PRODUCT_UNIT_DUPLICATE_PRODUCT_AND_UNIT: {
			code: 400_007,
			message: "Product unit with the same product_id and unit_id already exists",
			httpStatusCode: 400,
		},
		AUTH_INVALID_CREDENTIALS: {
			code: 401_001,
			message: "Invalid credentials",
			httpStatusCode: 401,
		},
		AUTH_ACCOUNT_LOCKED: {
			code: 423_001,
			message: "Account is temporarily locked due to repeated failed logins",
			httpStatusCode: 423,
		},
		AUTH_SESSION_INVALID: {
			code: 401_002,
			message: "Session is invalid or expired",
			httpStatusCode: 401,
		},
		AUTH_TOKEN_INVALID: {
			code: 401_003,
			message: "Token is invalid or expired",
			httpStatusCode: 401,
		},
		AUTH_USER_SUSPENDED: {
			code: 403_001,
			message: "User is suspended",
			httpStatusCode: 403,
		},
		ROLE_NOT_FOUND: {
			code: 404_006,
			message: "Role not found",
			httpStatusCode: 404,
		},
		PERMISSION_NOT_FOUND: {
			code: 404_007,
			message: "Permission not found",
			httpStatusCode: 404,
		},
		ROLE_REQUIRED_FIELDS: {
			code: 400_008,
			message: "Role requires store_id and name",
			httpStatusCode: 400,
		},
		STORE_MEMBER_NOT_FOUND: {
			code: 404_008,
			message: "Store member not found",
			httpStatusCode: 404,
		},
		CLIENT_ACCOUNT_NOT_FOUND: {
			code: 404_009,
			message: "Client account not found",
			httpStatusCode: 404,
		},
		CLIENT_ACCOUNT_REQUIRED_FIELDS: {
			code: 400_009,
			message: "Client account requires name, email, and password",
			httpStatusCode: 400,
		},
		CLIENT_ACCOUNT_ALREADY_EXISTS: {
			code: 409_001,
			message: "Client account with this email already exists",
			httpStatusCode: 409,
		},
		CLIENT_ACCOUNT_DELETE_BLOCKED: {
			code: 409_002,
			message: "Client account cannot be deleted while linked data still exists",
			httpStatusCode: 409,
		},
		CLIENT_ACCOUNT_DELETE_SELF_FORBIDDEN: {
			code: 403_003,
			message: "You cannot delete the client account currently in use",
			httpStatusCode: 403,
		},
	},
};
