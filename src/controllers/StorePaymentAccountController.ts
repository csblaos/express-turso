import { Request, Response } from "express";

import { StorePaymentAccountComponent } from "@components/StorePaymentAccountComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class StorePaymentAccountController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.getAll(req.requestId, String(req.params.storeId || ""));
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.create(req.requestId, String(req.params.storeId || ""), req.body || {});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.update(req.requestId, String(req.params.storeId || ""), String(req.params.id || ""), req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static setDefault = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.setDefault(req.requestId, String(req.params.storeId || ""), String(req.params.id || ""));
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await StorePaymentAccountComponent.delete(req.requestId, String(req.params.storeId || ""), String(req.params.id || ""));
		SuccessHandler.send(res, req.requestId);
	});
}
