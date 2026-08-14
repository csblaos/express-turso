import { Request, RequestHandler } from "express";

import { ENV } from "@configs/ENV";
import { RedisConn } from "@connections/RedisConn";
import { RbacInterface } from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { AuthToken } from "@utils/AuthToken";
import { appendServerTiming } from "@utils/ServerTiming";

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
		return async (req, res, next) => {
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

				const sessionStartedAt = process.hrtime.bigint();
				const session = await getJsonValue<SessionRecord>(`auth:session:${token.sid}`);
				appendServerTiming(
					res,
					"session",
					Number(process.hrtime.bigint() - sessionStartedAt) / 1_000_000,
				);
				if (!session || session.userId !== token.sub) {
					throw ApiError.UnauthorizedError("Session expired or revoked");
				}

				const storeId = getStoreIdFromRequest(req);
				const authDbStartedAt = process.hrtime.bigint();
				const access = await RbacInterface.getRequestAccess(token.sub, storeId);
				appendServerTiming(
					res,
					"auth-db",
					Number(process.hrtime.bigint() - authDbStartedAt) / 1_000_000,
				);
				const user = access.user;
				if (!user) {
					throw ApiError.UnauthorizedError("User not found");
				}

				if (user.client_suspended) {
					throw ApiError.ForbiddenError("User is suspended");
				}

				req.auth = {
					userId: String(user.id),
					sessionId: token.sid,
					systemRole: user.system_role,
					storeId,
					permissions: access.permissionKeys,
				};

				next();
			} catch (error) {
				next(error);
			}
		};
	}
}
