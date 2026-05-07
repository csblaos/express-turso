import { Request, Response } from "express";

import { AuthComponent } from "@components/AuthComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class AuthController {
	static login = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuthComponent.login(req.requestId, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static refresh = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuthComponent.refresh(req.requestId, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static logout = SyncFunction.handler(async (req: Request, res: Response) => {
		await AuthComponent.logout(req.requestId, req.body || {});
		SuccessHandler.send(res, req.requestId, "Logged out");
	});

	static me = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuthComponent.me(req.requestId, req);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static updateProfile = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuthComponent.updateProfile(req.requestId, req, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static changePassword = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuthComponent.changePassword(req.requestId, req, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
