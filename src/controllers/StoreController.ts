import { Request, Response } from "express";

import { StoreComponent } from "@components/StoreComponent";
import { StoreCostMethodHistoryInterface } from "@interfaces/StoreCostMethodHistoryInterface";
import { StoreCurrencyRateComponent } from "@components/StoreCurrencyRateComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateStoreInput } from "@models/Store";
import { SuccessHandler } from "@utils/SuccessHandler";

export class StoreController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.getAll(req.requestId, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.getById(req.requestId, req.params.id as string, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.create(req.requestId, req.body as CreateStoreInput, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.update(req.requestId, req.params.id as string, req.body || {}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await StoreComponent.delete(req.requestId, req.params.id as string, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId);
	});

	static getCurrencyRates = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreCurrencyRateComponent.getRates(req.requestId, req.params.id as string, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static updateCurrencyRates = SyncFunction.handler(async (req: Request, res: Response) => {
		const body = (req.body as Record<string, unknown>) || {};
		const data = await StoreCurrencyRateComponent.updateRates(req.requestId, req.params.id as string, {
			base_currency: String(body.base_currency || ""),
			supported_currencies: Array.isArray(body.supported_currencies) ? (body.supported_currencies as string[]) : [],
			rates: (body.rates && typeof body.rates === "object") ? (body.rates as Record<string, unknown>) : {},
		}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getCostMethodHistory = SyncFunction.handler(async (req: Request, res: Response) => {
		const limitRaw = req.query.limit;
		const parsed = typeof limitRaw === "string" ? Number(limitRaw) : Number.NaN;
		const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 50) : 10;
		const data = await StoreCostMethodHistoryInterface.findByStoreId(req.params.id as string, { limit });
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getCurrencyRateHistory = SyncFunction.handler(async (req: Request, res: Response) => {
		const limitRaw = req.query.limit;
		const parsed = typeof limitRaw === "string" ? Number(limitRaw) : Number.NaN;
		const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : 50;
		const data = await StoreCurrencyRateComponent.getHistory(req.requestId, req.params.id as string, {
			limit,
		}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
