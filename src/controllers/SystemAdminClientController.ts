import { Request, Response } from "express";

import { SystemAdminClientComponent } from "@components/SystemAdminClientComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class SystemAdminClientController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminClientComponent.listClients(req.requestId, {
			search: typeof req.query.search === "string" ? req.query.search : undefined,
			status: typeof req.query.status === "string" ? req.query.status : undefined,
			page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
			limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminClientComponent.createClient(req.requestId, req.body || {});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminClientComponent.updateClient(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static updateStatus = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminClientComponent.updateClientStatus(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static deleteCheck = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminClientComponent.getClientDeleteCheck(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static remove = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await SystemAdminClientComponent.deleteClient(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
