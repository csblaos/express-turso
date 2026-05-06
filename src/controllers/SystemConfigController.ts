import { Request, Response } from "express";

import { SystemConfigComponent } from "@components/SystemConfigComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SystemConfigController {
	static get = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemConfigComponent.getConfig(req.requestId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemConfigComponent.updateConfig(req.requestId, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
