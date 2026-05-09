import { Router } from "express";

import { RbacController } from "@controllers/RbacController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import RbacValidator from "@validators/RbacValidator";

export class RbacRouter {
	private static instance: RbacRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/store-members", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.users.view"), RbacValidator.listStoreMembers, RbacController.listStoreMembers);
		this.router.post("/store-members", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.users.create"), RbacValidator.createStoreMember, RbacController.createStoreMember);
		this.router.patch("/store-members/:storeId/:userId/status", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.users.suspend"), RbacValidator.updateStoreMemberStatus, RbacController.updateStoreMemberStatus);
		this.router.get("/permissions", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.view"), RbacController.listPermissions);
		this.router.get("/roles-summary", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.view"), RbacValidator.listRoles, RbacController.listRoleSummaries);
		this.router.get("/roles", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.view"), RbacValidator.listRoles, RbacController.listRoles);
		this.router.get("/roles/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.view"), RbacValidator.getRoleById, RbacController.getRoleById);
		this.router.post("/roles", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.create"), RbacValidator.createRole, RbacController.createRole);
		this.router.put("/roles/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.update"), RbacValidator.updateRole, RbacController.updateRole);
		this.router.delete("/roles/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.archive"), RbacValidator.deleteRole, RbacController.deleteRole);
		this.router.post("/roles/:id/duplicate", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.roles.create"), RbacValidator.duplicateRole, RbacController.duplicateRole);
		this.router.get("/users/:userId/permissions", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.users.view"), RbacValidator.getUserPermissions, RbacController.getUserPermissions);
		this.router.put("/store-members/:storeId/:userId/role", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.users.assign_role"), RbacValidator.assignStoreMemberRole, RbacController.assignStoreMemberRole);
		this.router.post("/store-members/:storeId/:userId/reset-password", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.users.reset_password"), RbacValidator.resetStoreMemberPassword, RbacController.resetStoreMemberPassword);
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
