import { Router } from "express";

import { SystemConfigController } from "@controllers/SystemConfigController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import SystemConfigValidator from "@validators/SystemConfigValidator";

export class SystemConfigRouter {
	private static instance: SystemConfigRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.read"), SystemConfigController.get);
		this.router.put("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.manage"), SystemConfigValidator.update, SystemConfigController.update);
	}

	static getInstance(): SystemConfigRouter {
		if (!SystemConfigRouter.instance) {
			SystemConfigRouter.instance = new SystemConfigRouter();
		}
		return SystemConfigRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
