import { Request, RequestHandler } from "express";

import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { ApiError } from "@middlewares/ApiError";
import { hasPermissionByKey } from "@utils/PermissionCompat";
import { resolveAcceptedPermissionKeys } from "@utils/PermissionCompat";

const SYSTEM_BYPASS_ROLES = new Set([ "system_admin", "superadmin" ]);

export class PermissionMiddleware {
	static require(permissionKey: string): RequestHandler {
		return async (req, _res, next) => {
			try {
				if (!req.auth) {
					throw ApiError.UnauthorizedError("Authentication context is missing");
				}

				if (SYSTEM_BYPASS_ROLES.has(req.auth.systemRole)) {
					next();
					return;
				}

				if (!hasPermissionByKey(req.auth.permissions, permissionKey)) {
					const acceptedKeys = resolveAcceptedPermissionKeys(permissionKey);
					await PermissionMiddleware.logPermissionDenied(req, permissionKey, acceptedKeys);
					throw ApiError.ForbiddenError(`Missing permission: ${permissionKey}`);
				}

				next();
			} catch (error) {
				next(error);
			}
		};
	}

	private static async logPermissionDenied(
		req: Request,
		requiredPermission: string,
		acceptedPermissions: string[],
	): Promise<void> {
		try {
			await AuditEventInterface.create({
				scope: "security",
				store_id: req.auth?.storeId || null,
				actor_user_id: req.auth?.userId || null,
				actor_role: req.auth?.systemRole || null,
				action: "permission_denied",
				entity_type: "permission",
				entity_id: requiredPermission,
				result: "failed",
				reason_code: "permission_denied",
				ip_address: req.ip || null,
				user_agent: req.header("user-agent") || null,
				request_id: req.requestId,
				metadata: {
					required_permission: requiredPermission,
					accepted_permissions: acceptedPermissions,
					granted_permissions: req.auth?.permissions || [],
					path: req.originalUrl || req.url,
					method: req.method,
				},
			});
		} catch {
			// Ignore telemetry failures to avoid blocking API responses.
		}
	}
}
