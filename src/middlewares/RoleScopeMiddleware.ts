import { RequestHandler } from "express";

import { ApiError } from "@middlewares/ApiError";

export class RoleScopeMiddleware {
	static requireSystemAdminOnly(): RequestHandler {
		return (req, _res, next) => {
			if (!req.auth) {
				return next(ApiError.UnauthorizedError("Authentication context is missing"));
			}

			if (req.auth.systemRole !== "system_admin") {
				return next(ApiError.ForbiddenError("System admin scope only"));
			}

			next();
		};
	}

	static requireSuperadminOnly(): RequestHandler {
		return (req, _res, next) => {
			if (!req.auth) {
				return next(ApiError.UnauthorizedError("Authentication context is missing"));
			}

			if (req.auth.systemRole !== "superadmin") {
				return next(ApiError.ForbiddenError("Superadmin scope only"));
			}

			next();
		};
	}

	static requireStoreWorkspace(): RequestHandler {
		return (req, _res, next) => {
			if (!req.auth) {
				return next(ApiError.UnauthorizedError("Authentication context is missing"));
			}

			if (req.auth.systemRole === "system_admin") {
				return next(ApiError.ForbiddenError("Store workspace is not available for system admin"));
			}

			next();
		};
	}
}
