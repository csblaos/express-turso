import { Request, Response } from "express";

import { PosComponent } from "@components/PosComponent";
import { OrderInterface, PosCheckoutPayload, PosPaymentMethod } from "@interfaces/OrderInterface";
import { ApiError } from "@middlewares/ApiError";
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

	static checkout = SyncFunction.handler(async (req: Request, res: Response) => {
		if (!req.auth) throw ApiError.UnauthorizedError();
		const body = req.body as Record<string, unknown>;
		const storeId = typeof body.store_id === "string" && body.store_id.trim() ? body.store_id.trim() : req.auth.storeId;
		if (!storeId) throw ApiError.BadRequestError("store_id is required");
		if (req.auth.storeId && req.auth.storeId !== storeId) throw ApiError.ForbiddenError("store scope mismatch");
		const data = await OrderInterface.checkout({
			store_id: storeId,
			service_mode: String(body.service_mode || "walk-in") as PosCheckoutPayload["service_mode"],
			payment_method: String(body.payment_method || "") as PosPaymentMethod,
			items: Array.isArray(body.items) ? body.items as PosCheckoutPayload["items"] : [],
			promotion_ids: Array.isArray(body.promotion_ids) ? body.promotion_ids.map(String) : [],
			amount_tendered: body.amount_tendered == null ? null : Number(body.amount_tendered),
			payment_account_id: typeof body.payment_account_id === "string" ? body.payment_account_id : null,
			payment_reference: typeof body.payment_reference === "string" ? body.payment_reference : null,
			payment_slip_url: typeof body.payment_slip_url === "string" ? body.payment_slip_url : null,
			note: typeof body.note === "string" ? body.note : null,
			idempotency_key: String(req.header("Idempotency-Key") || body.idempotency_key || "").trim(),
			created_by: req.auth.userId,
			request_id: req.requestId,
		});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static listOrders = SyncFunction.handler(async (req: Request, res: Response) => {
		if (!req.auth) throw ApiError.UnauthorizedError();
		const query = req.query as Record<string, unknown>;
		const storeId = typeof query.store_id === "string" && query.store_id.trim() ? query.store_id.trim() : req.auth.storeId;
		if (!storeId) throw ApiError.BadRequestError("store_id is required");
		if (req.auth.storeId && req.auth.storeId !== storeId) throw ApiError.ForbiddenError("store scope mismatch");
		const value = (key: string) => typeof query[key] === "string" ? String(query[key]) : undefined;
		const data = await OrderInterface.list({ storeId, query: value("query"), status: value("status"), channel: value("channel"), paymentStatus: value("payment_status"), paymentMethod: value("payment_method"), from: value("from"), to: value("to") });
		SuccessHandler.send(res, req.requestId, { data });
	});
}
