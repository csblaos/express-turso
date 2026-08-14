import { Request, Response } from "express";

import { SystemAdminReportComponent } from "@components/SystemAdminReportComponent";
import { ReportPeriodInput, ReportPreset } from "@interfaces/ReportInterface";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

function period(req: Request): ReportPeriodInput {
	return {
		preset: String(req.query.preset || req.query.range || "today") as ReportPreset,
		dateFrom: req.query.date_from ? String(req.query.date_from) : undefined,
		dateTo: req.query.date_to ? String(req.query.date_to) : undefined,
		timezoneOffset: Number(req.query.timezone_offset),
	};
}

export class SystemAdminReportController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminReportComponent.listStores(period(req));
		SuccessHandler.send(res, req.requestId, { data });
	});

	static detail = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminReportComponent.getStoreReport(String(req.params.storeId), period(req));
		SuccessHandler.send(res, req.requestId, { data });
	});
}
