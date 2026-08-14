import { Request, Response } from "express";

import { PromotionInterface } from "@interfaces/PromotionInterface";
import { ApiError } from "@middlewares/ApiError";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

function storeId(req: Request): string {
	const value = typeof req.query.store_id === "string" ? req.query.store_id : (req.body as any)?.store_id || req.auth?.storeId;
	if (!String(value || "").trim()) throw ApiError.BadRequestError("store_id is required");
	if (req.auth?.storeId && req.auth.storeId !== value) throw ApiError.ForbiddenError("store scope mismatch");
	return String(value).trim();
}

export class PromotionController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.send(res, req.requestId, { data: await PromotionInterface.list(storeId(req)) }));
	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		if (!req.auth) throw ApiError.UnauthorizedError();
		SuccessHandler.created(res, req.requestId, { data: await PromotionInterface.create(storeId(req), req.body || {}, req.auth.userId) });
	});
	static update = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.send(res, req.requestId, { data: await PromotionInterface.update(storeId(req), String(req.params.id || ""), req.body || {}) }));
	static archive = SyncFunction.handler(async (req: Request, res: Response) => { await PromotionInterface.archive(storeId(req), String(req.params.id || "")); SuccessHandler.send(res, req.requestId); });
	static evaluate = SyncFunction.handler(async (req: Request, res: Response) => {
		const body = req.body as any;
		SuccessHandler.send(res, req.requestId, { data: await PromotionInterface.evaluate(storeId(req), Array.isArray(body.items) ? body.items : [], Array.isArray(body.promotion_ids) ? body.promotion_ids.map(String) : undefined) });
	});
}
