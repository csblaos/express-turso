import { Router } from "express";

import { SuperadminBranchController } from "@controllers/SuperadminBranchController";
import { SuperadminConfigController } from "@controllers/SuperadminConfigController";
import { SuperadminQuotaController } from "@controllers/SuperadminQuotaController";
import { SuperadminSecurityController } from "@controllers/SuperadminSecurityController";
import { SuperadminUserController } from "@controllers/SuperadminUserController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import SuperadminConfigValidator from "@validators/SuperadminConfigValidator";

export class SuperadminUserRouter {
	private static instance: SuperadminUserRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireSuperadminOnly());
		this.router.get("/config", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.view"), SuperadminConfigController.get);
		this.router.put("/config", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.manage"), SuperadminConfigValidator.update, SuperadminConfigController.update);
		this.router.get("/users", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.users.view"), SuperadminUserController.list);
		this.router.get("/stores", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.stores.view"), SuperadminUserController.listStores);
		this.router.get("/branches", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.stores.view"), SuperadminBranchController.list);
		this.router.get("/security", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.users.view"), SuperadminSecurityController.snapshot);
		this.router.get("/quotas", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.users.view"), SuperadminQuotaController.list);
	}

	static getInstance(): SuperadminUserRouter {
		if (!SuperadminUserRouter.instance) {
			SuperadminUserRouter.instance = new SuperadminUserRouter();
		}
		return SuperadminUserRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
