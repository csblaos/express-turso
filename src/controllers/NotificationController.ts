import { Request, Response } from "express";

import { NotificationInterface } from "@interfaces/NotificationInterface";
import { ApiError } from "@middlewares/ApiError";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

function context(req: Request) {
	if (!req.auth) throw ApiError.UnauthorizedError();
	const storeId = String(req.query.store_id || req.auth.storeId || "").trim();
	if (!storeId) throw ApiError.BadRequestError("store_id is required");
	if (req.auth.storeId && req.auth.storeId !== storeId) throw ApiError.ForbiddenError("store scope mismatch");
	return { storeId, userId: req.auth.userId };
}

export class NotificationController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const { storeId, userId } = context(req);
		const status = req.query.status === "unread" ? "unread" : "all";
		const topic = req.query.topic === "stock" || req.query.topic === "promotion" ? req.query.topic : "all";
		const data = await NotificationInterface.list(storeId, userId, {
			limit: Number(req.query.limit || 20),
			status,
			topic,
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static markRead = SyncFunction.handler(async (req: Request, res: Response) => {
		const { storeId, userId } = context(req);
		const data = await NotificationInterface.markRead(storeId, userId, String(req.params.id || ""));
		SuccessHandler.send(res, req.requestId, { data });
	});

	static markAllRead = SyncFunction.handler(async (req: Request, res: Response) => {
		const { storeId, userId } = context(req);
		const data = await NotificationInterface.markAllRead(storeId, userId);
		SuccessHandler.send(res, req.requestId, { data });
	});
}
