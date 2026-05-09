import { Request, Response } from "express";

import { SuperadminUserComponent } from "@components/SuperadminUserComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SuperadminUserController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminUserComponent.listUsers(req.requestId, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		}, {
			search: typeof req.query.search === "string" ? req.query.search : undefined,
			status: typeof req.query.status === "string" ? req.query.status : undefined,
			page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
			limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
		});

		SuccessHandler.send(res, req.requestId, { data });
	});

	static listStores = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminUserComponent.listStores(req.requestId, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});

		SuccessHandler.send(res, req.requestId, { data });
	});
}
