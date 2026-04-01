import express, { NextFunction, Request, Response } from "express";

import { ENV } from "@configs/ENV";
import { ApiError } from "@middlewares/ApiError";
import { ErrorHandler } from "@middlewares/ErrorHandler";
import { RequestMiddleware } from "@middlewares/RequestMiddleware";
import { IndexRouter } from "@routers/IndexRouter";
import { Tracer } from "./Tracer";

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
	res.setHeader("access-control-allow-origin", ENV.SERVER.CORS_ORIGIN);
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
app.use(Tracer.middleware);

app.get("/healthz", (req, res) => {
	res.status(200).json({ success: true, message: "ok" });
});

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
