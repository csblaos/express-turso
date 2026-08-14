import { NextFunction, Request, RequestHandler, Response } from "express";

import { PrintQueueInterface } from "@interfaces/PrintQueueInterface";
import { ApiError } from "@middlewares/ApiError";

declare module "express-serve-static-core" {
	interface Request {
		printAgent?: { id: string; storeId: string };
	}
}

/** Print agents are machines on a shop counter, not people. They present their
 * own token and can reach nothing but their own store's print queue, so a token
 * copied off a till cannot read a bill or take a payment. */
export class PrintAgentMiddleware {
	static requireAgent(): RequestHandler {
		return async (req: Request, res: Response, next: NextFunction) => {
			try {
				const header = String(req.header("X-Print-Token") || "");
				const bearer = String(req.header("Authorization") || "").replace(/^Bearer\s+/i, "");
				const agent = await PrintQueueInterface.authenticateAgent(header || bearer);
				if (!agent) throw ApiError.UnauthorizedError("invalid print agent token");
				req.printAgent = agent;
				next();
			} catch (error) {
				next(error);
			}
		};
	}
}
