import { Request, Response } from "express";

import { SystemAdminDashboardComponent } from "@components/SystemAdminDashboardComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SystemAdminDashboardController {
	static snapshot = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminDashboardComponent.getSnapshot(req.requestId);
		SuccessHandler.send(res, req.requestId, { data });
	});
}
