import { Request, RequestHandler } from "express";

import { ENV } from "@configs/ENV";
import { RedisConn } from "@connections/RedisConn";
import { AuthInterface } from "@interfaces/AuthInterface";
import { RbacInterface } from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { AuthToken } from "@utils/AuthToken";

type SessionRecord = {
	id: string;
	userId: string;
	systemRole: string;
};

function getStoreIdFromRequest(req: Request): string | undefined {
	if (typeof req.query.store_id === "string" && req.query.store_id.trim()) {
		return req.query.store_id.trim();
	}

	const body = req.body as Record<string, unknown> | undefined;
	if (body && typeof body.store_id === "string" && body.store_id.trim()) {
		return body.store_id.trim();
	}

	if (typeof req.params.storeId === "string" && req.params.storeId.trim()) {
		return req.params.storeId.trim();
	}

	return undefined;
}

async function getJsonValue<T>(key: string): Promise<T | null> {
	const rawValue = await RedisConn.get(key);
	if (!rawValue) return null;
	try {
		return JSON.parse(rawValue) as T;
	} catch {
		return null;
	}
}

export class AuthGuardMiddleware {
	static requireAuth(): RequestHandler {
		return async (req, _res, next) => {
			try {
				const authorization = req.header("authorization") || "";
				const accessToken = authorization.startsWith("Bearer ")
					? authorization.slice(7).trim()
					: "";

				if (!accessToken) {
					throw ApiError.UnauthorizedError("Missing bearer token");
				}

				const token = AuthToken.verify(accessToken, ENV.AUTH.JWT_SECRET);
				if (!token || token.typ !== "access") {
					throw ApiError.UnauthorizedError("Invalid bearer token");
				}

				const session = await getJsonValue<SessionRecord>(`auth:session:${token.sid}`);
				if (!session || session.userId !== token.sub) {
					throw ApiError.UnauthorizedError("Session expired or revoked");
				}

				const user = await AuthInterface.findUserById(token.sub);
				if (!user) {
					throw ApiError.UnauthorizedError("User not found");
				}

				if (user.client_suspended) {
					throw ApiError.ForbiddenError("User is suspended");
				}

				const storeId = getStoreIdFromRequest(req);
				const access = await RbacInterface.getUserPermissions(String(user.id), storeId);

				req.auth = {
					userId: String(user.id),
					sessionId: token.sid,
					systemRole: user.system_role,
					storeId,
					permissions: access.permissions.map((permission) => permission.key),
				};

				next();
			} catch (error) {
				next(error);
			}
		};
	}
}
