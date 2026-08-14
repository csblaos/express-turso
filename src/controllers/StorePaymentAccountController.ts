import { Request, Response } from "express";

import { StorePaymentAccountComponent } from "@components/StorePaymentAccountComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

function getStoreId(req: Request): string {
	const body = req.body as Record<string, unknown> | undefined;
	const value = req.params.storeId || req.query.store_id || body?.store_id || req.auth?.storeId || "";
	return String(value).trim();
}

export class StorePaymentAccountController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.getAll(req.requestId, getStoreId(req), {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.create(req.requestId, getStoreId(req), req.body || {}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.update(req.requestId, getStoreId(req), String(req.params.id || ""), req.body || {}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static setDefault = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StorePaymentAccountComponent.setDefault(req.requestId, getStoreId(req), String(req.params.id || ""), {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await StorePaymentAccountComponent.delete(req.requestId, getStoreId(req), String(req.params.id || ""), {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId);
	});
}
