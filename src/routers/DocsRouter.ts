import { NextFunction, Request, Response, Router } from "express";
import swaggerUi from "swagger-ui-express";

import { OpenApiSpec } from "@storage/openapi";

function getServerUrl(req: Request): string {
	const forwardedProto = req.headers?.["x-forwarded-proto"];
	const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : req.protocol;
	return `${proto}://${req.get("host")}`;
}

function getOpenApiSpecForRequest(req: Request): Record<string, unknown> {
	return {
		...OpenApiSpec,
		servers: [ { url: getServerUrl(req) } ],
	};
}

export class DocsRouter {
	private static instance: DocsRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/openapi.json", (req, res) => {
			res.status(200).json(getOpenApiSpecForRequest(req));
		});

		this.router.use("/", swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
			const spec = getOpenApiSpecForRequest(req);
			const handler = swaggerUi.setup(spec, {
				swaggerOptions: {
					persistAuthorization: true,
				},
			});

			return handler(req, res, next);
		});
	}

	static getInstance(): DocsRouter {
		if (!DocsRouter.instance) {
			DocsRouter.instance = new DocsRouter();
		}
		return DocsRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
