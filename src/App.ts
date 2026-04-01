import express, { NextFunction, Request, Response } from "express";

import { Config } from "@configs/Config";
import { ENV } from "@configs/ENV";
import { ApiError } from "@middlewares/ApiError";
import { ErrorHandler } from "@middlewares/ErrorHandler";
import { RequestMiddleware } from "@middlewares/RequestMiddleware";
import { IndexRouter } from "@routers/IndexRouter";
import { DocsRouter } from "@routers/DocsRouter";

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
	res.setHeader("access-control-allow-origin", "*");
	res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	res.setHeader("access-control-allow-headers", "content-type,authorization,request-id");

	if (req.method === "OPTIONS") {
		res.status(204).end();
		return;
	}

	next();
}

const app = express();

app.use(corsMiddleware);
app.use(RequestMiddleware.requestResponseLog);

app.get("/healthz", (req, res) => {
	res.status(200).json({ success: true, message: "ok" });
});

if (ENV.SERVER.NODE_ENV !== "production" && Config.swagger.enabled) {
	app.use(Config.swagger.path, DocsRouter.getInstance().getRouter());
} else if (ENV.SERVER.NODE_ENV === "production" && Config.swagger.enabled) {
	console.warn("[swagger] disabled in production");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
	if (err instanceof SyntaxError) {
		next(ApiError.BadRequestError("Invalid JSON body"));
		return;
	}
	next(err);
});

app.use("/api", IndexRouter.getInstance().getRouter());

app.use((req, res, next) => {
	next(ApiError.NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
});

app.use(ErrorHandler.errorHandler);

export default app;
