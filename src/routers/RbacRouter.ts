import { Router } from "express";

import { RbacController } from "@controllers/RbacController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import RbacValidator from "@validators/RbacValidator";

export class RbacRouter {
	private static instance: RbacRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/store-members", PermissionMiddleware.require("settings.users.view"), RbacValidator.listStoreMembers, RbacController.listStoreMembers);
		this.router.post("/store-members", PermissionMiddleware.require("settings.users.create"), RbacValidator.createStoreMember, RbacController.createStoreMember);
		this.router.delete("/store-members/:storeId/:userId", PermissionMiddleware.require("settings.users.remove_member"), RbacController.deleteStoreMember);
		this.router.patch("/store-members/:storeId/:userId/status", PermissionMiddleware.require("settings.users.suspend"), RbacValidator.updateStoreMemberStatus, RbacController.updateStoreMemberStatus);
		this.router.get("/permissions", PermissionMiddleware.require("settings.roles.view"), RbacController.listPermissions);
		this.router.get("/roles-summary", PermissionMiddleware.require("settings.roles.view"), RbacValidator.listRoles, RbacController.listRoleSummaries);
		this.router.get("/roles", PermissionMiddleware.require("settings.roles.view"), RbacValidator.listRoles, RbacController.listRoles);
		this.router.get("/roles/:id", PermissionMiddleware.require("settings.roles.view"), RbacValidator.getRoleById, RbacController.getRoleById);
		this.router.post("/roles", PermissionMiddleware.require("settings.roles.create"), RbacValidator.createRole, RbacController.createRole);
		this.router.put("/roles/:id", PermissionMiddleware.require("settings.roles.update"), RbacValidator.updateRole, RbacController.updateRole);
		this.router.delete("/roles/:id", PermissionMiddleware.require("settings.roles.archive"), RbacValidator.deleteRole, RbacController.deleteRole);
		this.router.post("/roles/:id/duplicate", PermissionMiddleware.require("settings.roles.create"), RbacValidator.duplicateRole, RbacController.duplicateRole);
		this.router.post("/roles/:id/apply", PermissionMiddleware.require("settings.roles.create"), RbacValidator.applyRole, RbacController.applyRole);
		this.router.get("/users/:userId/permissions", PermissionMiddleware.require("settings.users.view"), RbacValidator.getUserPermissions, RbacController.getUserPermissions);
		this.router.put("/store-members/:storeId/:userId/role", PermissionMiddleware.require("settings.users.assign_role"), RbacValidator.assignStoreMemberRole, RbacController.assignStoreMemberRole);
		this.router.post("/store-members/:storeId/:userId/reset-password", PermissionMiddleware.require("settings.users.reset_password"), RbacValidator.resetStoreMemberPassword, RbacController.resetStoreMemberPassword);
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
