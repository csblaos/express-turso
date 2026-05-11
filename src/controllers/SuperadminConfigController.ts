import { Request, Response } from "express";

import { SuperadminConfigComponent } from "@components/SuperadminConfigComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SuperadminConfigController {
	static get = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminConfigComponent.getConfig(req.requestId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminConfigComponent.updateConfig(req.requestId, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
