import { RequestHandler } from "express";

import { ApiError } from "@middlewares/ApiError";

const SYSTEM_BYPASS_ROLES = new Set([ "system_admin", "superadmin" ]);

export class PermissionMiddleware {
	static require(permissionKey: string): RequestHandler {
		return (req, _res, next) => {
			try {
				if (!req.auth) {
					throw ApiError.UnauthorizedError("Authentication context is missing");
				}

				if (SYSTEM_BYPASS_ROLES.has(req.auth.systemRole)) {
					next();
					return;
				}

				if (!req.auth.permissions.includes(permissionKey)) {
					throw ApiError.ForbiddenError(`Missing permission: ${permissionKey}`);
				}

				next();
			} catch (error) {
				next(error);
			}
		};
	}
}
