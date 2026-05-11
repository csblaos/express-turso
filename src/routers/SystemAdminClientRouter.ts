import { Router } from "express";

import { SystemAdminClientController } from "@controllers/SystemAdminClientController";
import { SystemConfigController } from "@controllers/SystemConfigController";
import { SystemAdminDashboardController } from "@controllers/SystemAdminDashboardController";
import { SystemAdminMonitoringController } from "@controllers/SystemAdminMonitoringController";
import { SystemAdminSecurityController } from "@controllers/SystemAdminSecurityController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import SystemAdminClientValidator from "@validators/SystemAdminClientValidator";
import SystemConfigValidator from "@validators/SystemConfigValidator";

export class SystemAdminClientRouter {
	private static instance: SystemAdminClientRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireSystemAdminOnly());
		this.router.get("/dashboard", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.dashboard.view"), SystemAdminDashboardController.snapshot);
		this.router.get("/monitoring", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.monitoring.view"), SystemAdminMonitoringController.snapshot);
		this.router.get("/security", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.security.view"), SystemAdminSecurityController.snapshot);
		this.router.get("/config", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.config.update"), SystemConfigController.get);
		this.router.put("/config", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.config.update"), SystemConfigValidator.update, SystemConfigController.update);
		this.router.get("/clients", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.view"), SystemAdminClientValidator.list, SystemAdminClientController.list);
		this.router.get("/clients/:id/delete-check", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.delete"), SystemAdminClientValidator.deleteCheck, SystemAdminClientController.deleteCheck);
		this.router.post("/clients", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.create"), SystemAdminClientValidator.create, SystemAdminClientController.create);
		this.router.patch("/clients/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.update"), SystemAdminClientValidator.update, SystemAdminClientController.update);
		this.router.patch("/clients/:id/status", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.update"), SystemAdminClientValidator.updateStatus, SystemAdminClientController.updateStatus);
		this.router.post("/clients/:id/reset-password", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.update"), SystemAdminClientValidator.resetPassword, SystemAdminClientController.resetPassword);
		this.router.delete("/clients/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("system_admin.clients.delete"), SystemAdminClientValidator.remove, SystemAdminClientController.remove);
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
