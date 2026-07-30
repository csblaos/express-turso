import { Request, Response } from "express";

import { SuperadminOverviewComponent } from "@components/SuperadminOverviewComponent";
import { ReportPreset } from "@interfaces/ReportInterface";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SuperadminOverviewController {
	static dashboard = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminOverviewComponent.dashboard({
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		}, {
			preset: String(req.query.preset || "7d") as ReportPreset,
			dateFrom: req.query.date_from ? String(req.query.date_from) : undefined,
			dateTo: req.query.date_to ? String(req.query.date_to) : undefined,
			timezoneOffset: Number(req.query.timezone_offset || 420),
			storeId: req.query.store_id ? String(req.query.store_id) : undefined,
		});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
