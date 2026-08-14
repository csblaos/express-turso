import { Request, Response } from "express";

import { PrintQueueInterface } from "@interfaces/PrintQueueInterface";
import { ApiError } from "@middlewares/ApiError";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

function storeId(req: Request): string {
	const body = req.body as Record<string, unknown> | undefined;
	const value = typeof req.query.store_id === "string" ? req.query.store_id : body?.store_id || req.auth?.storeId;
	const normalized = String(value || "").trim();
	if (!normalized) throw ApiError.BadRequestError("store_id is required");
	if (req.auth?.storeId && req.auth.storeId !== normalized) throw ApiError.ForbiddenError("store scope mismatch");
	return normalized;
}

function agent(req: Request): { id: string; storeId: string } {
	if (!req.printAgent) throw ApiError.UnauthorizedError();
	return req.printAgent;
}

export class PrintQueueController {
	static printers = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.send(res, req.requestId, { data: await PrintQueueInterface.listPrinters(storeId(req)) }));
	static createPrinter = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.created(res, req.requestId, { data: await PrintQueueInterface.savePrinter(storeId(req), req.body) }));
	static updatePrinter = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.send(res, req.requestId, { data: await PrintQueueInterface.savePrinter(storeId(req), req.body, String(req.params.id)) }));
	static deletePrinter = SyncFunction.handler(async (req: Request, res: Response) => { await PrintQueueInterface.deletePrinter(storeId(req), String(req.params.id)); SuccessHandler.send(res, req.requestId); });
	static agents = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.send(res, req.requestId, { data: await PrintQueueInterface.listAgents(storeId(req)) }));
	// The plaintext token appears in this response and nowhere else, ever again.
	static createAgent = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.created(res, req.requestId, { data: await PrintQueueInterface.createAgent(storeId(req), req.body) }));
	static deleteAgent = SyncFunction.handler(async (req: Request, res: Response) => { await PrintQueueInterface.deleteAgent(storeId(req), String(req.params.id)); SuccessHandler.send(res, req.requestId); });
	static jobs = SyncFunction.handler(async (req: Request, res: Response) => SuccessHandler.send(res, req.requestId, { data: await PrintQueueInterface.listJobs(storeId(req)) }));
	static retryJob = SyncFunction.handler(async (req: Request, res: Response) => { await PrintQueueInterface.retryJob(storeId(req), String(req.params.id)); SuccessHandler.send(res, req.requestId); });

	static claim = SyncFunction.handler(async (req: Request, res: Response) => {
		const claimant = agent(req);
		const jobs = await PrintQueueInterface.claimJobs(claimant.storeId, claimant.id, Number(req.body?.limit) || 5);
		SuccessHandler.send(res, req.requestId, { data: jobs });
	});

	static complete = SyncFunction.handler(async (req: Request, res: Response) => {
		const claimant = agent(req);
		await PrintQueueInterface.completeJob(claimant.storeId, String(req.params.id), req.body?.ok !== false, String(req.body?.error || ""));
		SuccessHandler.send(res, req.requestId);
	});
}
