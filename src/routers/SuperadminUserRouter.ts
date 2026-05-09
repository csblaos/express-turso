import { Router } from "express";

import { SuperadminUserController } from "@controllers/SuperadminUserController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";

export class SuperadminUserRouter {
	private static instance: SuperadminUserRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/users", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.manage"), SuperadminUserController.list);
		this.router.get("/stores", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("superadmin.manage"), SuperadminUserController.listStores);
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
