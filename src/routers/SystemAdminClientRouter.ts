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
		this.router.get("/dashboard", PermissionMiddleware.require("system_admin.dashboard.view"), SystemAdminDashboardController.snapshot);
		this.router.get("/monitoring", PermissionMiddleware.require("system_admin.monitoring.view"), SystemAdminMonitoringController.snapshot);
		this.router.get("/security", PermissionMiddleware.require("system_admin.security.view"), SystemAdminSecurityController.snapshot);
		this.router.get("/config", PermissionMiddleware.require("system_admin.config.update"), SystemConfigController.get);
		this.router.put("/config", PermissionMiddleware.require("system_admin.config.update"), SystemConfigValidator.update, SystemConfigController.update);
		this.router.get("/clients", PermissionMiddleware.require("system_admin.clients.view"), SystemAdminClientValidator.list, SystemAdminClientController.list);
		this.router.get("/clients/:id/delete-check", PermissionMiddleware.require("system_admin.clients.delete"), SystemAdminClientValidator.deleteCheck, SystemAdminClientController.deleteCheck);
		this.router.post("/clients", PermissionMiddleware.require("system_admin.clients.create"), SystemAdminClientValidator.create, SystemAdminClientController.create);
		this.router.patch("/clients/:id", PermissionMiddleware.require("system_admin.clients.update"), SystemAdminClientValidator.update, SystemAdminClientController.update);
		this.router.patch("/clients/:id/status", PermissionMiddleware.require("system_admin.clients.update"), SystemAdminClientValidator.updateStatus, SystemAdminClientController.updateStatus);
		this.router.post("/clients/:id/reset-password", PermissionMiddleware.require("system_admin.clients.update"), SystemAdminClientValidator.resetPassword, SystemAdminClientController.resetPassword);
		this.router.delete("/clients/:id", PermissionMiddleware.require("system_admin.clients.delete"), SystemAdminClientValidator.remove, SystemAdminClientController.remove);
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
