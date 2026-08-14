import { Request, Response } from "express";

import { PurchaseOrderComponent } from "@components/PurchaseOrderComponent";
import {
	PurchaseOrderCreatePayload,
	PurchaseOrderListFilters,
	PurchaseOrderUpdatePayload,
} from "@interfaces/PurchaseOrderInterface";
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

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await PurchaseOrderComponent.update(
			req.requestId,
			req.params.id as string,
			{
				...(req.body as PurchaseOrderUpdatePayload),
				updated_by: req.auth?.userId || null,
			},
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static markOrdered = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await PurchaseOrderComponent.markOrdered(
			req.requestId,
			req.params.id as string,
			req.auth?.userId || null,
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static markArrived = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await PurchaseOrderComponent.markArrived(
			req.requestId,
			req.params.id as string,
			req.auth?.userId || null,
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static receive = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await PurchaseOrderComponent.receive(
			req.requestId,
			req.params.id as string,
			req.auth?.userId || null,
			Array.isArray(req.body?.items)
				? req.body.items.map((item: { item_id: string; qty_received: number }) => ({
						item_id: item.item_id,
						qty_received: item.qty_received,
					}))
				: [],
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static settle = SyncFunction.handler(async (req: Request, res: Response) => {
		const body = (req.body as Record<string, unknown>) || {};
		const data = await PurchaseOrderComponent.settle(req.requestId, req.params.id as string, {
			exchange_rate: typeof body.exchange_rate === "number" ? body.exchange_rate : typeof body.exchange_rate === "string" ? Number(body.exchange_rate) : undefined,
			shipping_cost: typeof body.shipping_cost === "number" ? body.shipping_cost : typeof body.shipping_cost === "string" ? Number(body.shipping_cost) : undefined,
			other_cost: typeof body.other_cost === "number" ? body.other_cost : typeof body.other_cost === "string" ? Number(body.other_cost) : undefined,
			payment_reference: typeof body.payment_reference === "string" ? String(body.payment_reference) : null,
			payment_note: typeof body.payment_note === "string" ? String(body.payment_note) : null,
			paid_at: typeof body.paid_at === "string" ? String(body.paid_at) : undefined,
			settled_by: req.auth?.userId || null,
		});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
