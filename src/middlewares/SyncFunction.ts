import { NextFunction, Request, RequestHandler, Response } from "express";

export class SyncFunction {
	static handler(
		fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
	): RequestHandler {
		return (req, res, next) => {
			req.isSeamless = false;
			Promise.resolve(fn(req, res, next)).catch(next);
		};
	}

	static seamlessHandler(
		fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
	): RequestHandler {
		return (req, res, next) => {
			req.isSeamless = true;
			Promise.resolve(fn(req, res, next)).catch(next);
		};
	}
}
