import { Router } from "express";

import { RbacController } from "@controllers/RbacController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import RbacValidator from "@validators/RbacValidator";

export class RbacRouter {
	private static instance: RbacRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/store-members", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_users"), RbacValidator.listStoreMembers, RbacController.listStoreMembers);
		this.router.post("/store-members", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_users"), RbacValidator.createStoreMember, RbacController.createStoreMember);
		this.router.patch("/store-members/:storeId/:userId/status", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_users"), RbacValidator.updateStoreMemberStatus, RbacController.updateStoreMemberStatus);
		this.router.get("/permissions", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacController.listPermissions);
		this.router.get("/roles", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacValidator.listRoles, RbacController.listRoles);
		this.router.get("/roles/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacValidator.getRoleById, RbacController.getRoleById);
		this.router.post("/roles", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacValidator.createRole, RbacController.createRole);
		this.router.put("/roles/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacValidator.updateRole, RbacController.updateRole);
		this.router.post("/roles/:id/duplicate", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacValidator.duplicateRole, RbacController.duplicateRole);
		this.router.get("/users/:userId/permissions", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_roles"), RbacValidator.getUserPermissions, RbacController.getUserPermissions);
		this.router.put("/store-members/:storeId/:userId/role", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_users"), RbacValidator.assignStoreMemberRole, RbacController.assignStoreMemberRole);
		this.router.post("/store-members/:storeId/:userId/reset-password", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_users"), RbacValidator.resetStoreMemberPassword, RbacController.resetStoreMemberPassword);
	}

	static getInstance(): RbacRouter {
		if (!RbacRouter.instance) {
			RbacRouter.instance = new RbacRouter();
		}
		return RbacRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
