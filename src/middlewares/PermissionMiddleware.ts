import { Request, RequestHandler } from "express";

import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { ApiError } from "@middlewares/ApiError";
import { hasPermissionByKey } from "@utils/PermissionCompat";
import { resolveAcceptedPermissionKeys } from "@utils/PermissionCompat";

const SYSTEM_BYPASS_ROLES = new Set([ "system_admin", "superadmin" ]);
const SYSTEM_ADMIN_PERMISSION_PREFIX = "system_admin.";

export class PermissionMiddleware {
	static require(permissionKey: string): RequestHandler {
		return async (req, _res, next) => {
			try {
				if (!req.auth) {
					throw ApiError.UnauthorizedError("Authentication context is missing");
				}

				if (
					permissionKey.startsWith(SYSTEM_ADMIN_PERMISSION_PREFIX)
					&& req.auth.systemRole !== "system_admin"
				) {
					const acceptedKeys = resolveAcceptedPermissionKeys(permissionKey);
					await PermissionMiddleware.logPermissionDenied(req, permissionKey, acceptedKeys);
					throw ApiError.ForbiddenError(`Missing system admin scope: ${permissionKey}`);
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

	/** Store updates share one endpoint, so choose the narrowly-scoped setting
	 * permission from the fields being changed instead of granting broad store
	 * administration for a receipt, payment, or customer-display change. */
	static requireStoreSettingsUpdate(): RequestHandler {
		return (req, res, next) => {
			const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
			const keys = Object.keys(body);
			const requiredPermissions = new Set<string>();
			if (keys.some((key) => key.startsWith("receipt_"))) requiredPermissions.add("settings.printing.update");
			// How the kitchen receives orders is a floor decision, not a paper one.
			if (keys.includes("kitchen_delivery_mode")) requiredPermissions.add("settings.restaurant.update");
			if (keys.some((key) => [ "currency", "supported_currencies", "vat_enabled", "vat_rate", "cost_method" ].includes(key))) requiredPermissions.add("settings.finance.update");
			if (keys.includes("allow_negative_stock")) requiredPermissions.add("settings.stock_policy.update");
			if (keys.some((key) => key.startsWith("customer_display_"))) requiredPermissions.add("settings.customer_display.update");
			if (keys.some((key) => [ "pickup_queue_enabled", "business_day_start_minutes" ].includes(key))) requiredPermissions.add("settings.restaurant.update");
			if (requiredPermissions.size === 0) requiredPermissions.add("settings.store.update");

			const checks = Array.from(requiredPermissions).map((permission) => PermissionMiddleware.require(permission));
			let checkIndex = 0;
			const checkNext = (error?: unknown) => {
				if (error) return next(error);
				const check = checks[checkIndex++];
				return check ? check(req, res, checkNext) : next();
			};
			return checkNext();
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
