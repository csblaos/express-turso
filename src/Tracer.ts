import { NextFunction, Request, Response } from "express";

import { ENV } from "@configs/ENV";

export class Tracer {
	static init(): void {
		if (!ENV.SERVER.TRACER_ENABLED) return;
		console.log("[tracer] enabled (no-op)");
	}

	static middleware(req: Request, res: Response, next: NextFunction): void {
		next();
	}
}
