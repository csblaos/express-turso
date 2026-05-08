import { Request, Response } from "express";

import { SystemAdminSecurityComponent } from "@components/SystemAdminSecurityComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SystemAdminSecurityController {
	static snapshot = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminSecurityComponent.getSnapshot(req.requestId);
		SuccessHandler.send(res, req.requestId, { data });
	});
}

