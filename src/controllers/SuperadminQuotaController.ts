import { Request, Response } from "express";

import { SuperadminQuotaComponent } from "@components/SuperadminQuotaComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SuperadminQuotaController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminQuotaComponent.listQuotas(req.requestId, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		}, {
			search: typeof req.query.search === "string" ? req.query.search : undefined,
			mode: typeof req.query.mode === "string" ? req.query.mode : undefined,
			page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
			limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
		});

		SuccessHandler.send(res, req.requestId, { data });
	});
}
