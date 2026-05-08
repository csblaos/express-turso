import { Request, Response } from "express";

import { SystemAdminMonitoringComponent } from "@components/SystemAdminMonitoringComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SystemAdminMonitoringController {
	static snapshot = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminMonitoringComponent.getSnapshot(req.requestId);
		SuccessHandler.send(res, req.requestId, { data });
	});
}
