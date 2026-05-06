import { Request, Response } from "express";

import { PurchaseOrderComponent } from "@components/PurchaseOrderComponent";
import { PurchaseOrderCreatePayload, PurchaseOrderListFilters } from "@interfaces/PurchaseOrderInterface";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class PurchaseOrderController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const query = req.query as Record<string, unknown>;
		const filters: PurchaseOrderListFilters = {
			storeId: typeof query.store_id === "string" ? query.store_id : undefined,
			query: typeof query.query === "string" ? query.query : undefined,
			status: typeof query.status === "string" ? query.status : undefined,
			paymentStatus: typeof query.payment_status === "string" ? query.payment_status : undefined,
		};

		const data = await PurchaseOrderComponent.getAll(req.requestId, filters);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await PurchaseOrderComponent.getById(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await PurchaseOrderComponent.create(req.requestId, req.body as PurchaseOrderCreatePayload);
		SuccessHandler.created(res, req.requestId, { data });
	});
}
