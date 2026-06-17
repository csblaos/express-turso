import { Request, Response } from "express";

import { PosComponent } from "@components/PosComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class PosController {
	static getCatalog = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.query.store_id === "string" && req.query.store_id.trim()
			? req.query.store_id.trim()
			: req.auth?.storeId;
		const data = await PosComponent.getCatalog(req.requestId, storeId);
		SuccessHandler.send(res, req.requestId, { data });
	});
}
