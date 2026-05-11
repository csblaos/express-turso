import { Request, Response } from "express";

import { SuperadminSecurityComponent } from "@components/SuperadminSecurityComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SuperadminSecurityController {
	static snapshot = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SuperadminSecurityComponent.getSnapshot(req.requestId, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});

		SuccessHandler.send(res, req.requestId, { data });
	});
}
