import { Router } from "express";

import { AuditEventController } from "@controllers/AuditEventController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import AuditEventValidator from "@validators/AuditEventValidator";

export class AuditEventRouter {
	private static instance: AuditEventRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("activity.view"), AuditEventValidator.list, AuditEventController.list);
		this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("activity.view"), AuditEventValidator.getById, AuditEventController.getById);
		this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.manage"), AuditEventValidator.create, AuditEventController.create);
	}

	static getInstance(): AuditEventRouter {
		if (!AuditEventRouter.instance) {
			AuditEventRouter.instance = new AuditEventRouter();
		}
		return AuditEventRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
