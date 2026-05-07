import { Router } from "express";

import { SystemAdminClientController } from "@controllers/SystemAdminClientController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import SystemAdminClientValidator from "@validators/SystemAdminClientValidator";

export class SystemAdminClientRouter {
	private static instance: SystemAdminClientRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/clients", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.manage"), SystemAdminClientValidator.list, SystemAdminClientController.list);
		this.router.post("/clients", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.manage"), SystemAdminClientValidator.create, SystemAdminClientController.create);
		this.router.patch("/clients/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.manage"), SystemAdminClientValidator.update, SystemAdminClientController.update);
		this.router.patch("/clients/:id/status", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.manage"), SystemAdminClientValidator.updateStatus, SystemAdminClientController.updateStatus);
	}

	static getInstance(): SystemAdminClientRouter {
		if (!SystemAdminClientRouter.instance) {
			SystemAdminClientRouter.instance = new SystemAdminClientRouter();
		}
		return SystemAdminClientRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
