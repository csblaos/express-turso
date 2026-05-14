import { Router } from "express";

import { UnitController } from "@controllers/UnitController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import CommonValidator from "@validators/CommonValidator";
import UnitValidator from "@validators/UnitValidator";

export class UnitRouter {
	private static instance: UnitRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("products.view"), UnitValidator.list, UnitController.getAll);
		this.router.get("/:id", PermissionMiddleware.require("products.view"), CommonValidator.resourceId, UnitController.getById);
		this.router.post("/", PermissionMiddleware.require("products.create"), UnitValidator.create, UnitController.create);
		this.router.post("/import-defaults", PermissionMiddleware.require("products.create"), UnitValidator.importDefaults, UnitController.importDefaults);
		this.router.put("/:id", PermissionMiddleware.require("products.update"), UnitValidator.update, UnitController.update);
		this.router.delete("/:id", PermissionMiddleware.require("products.archive"), CommonValidator.resourceId, UnitController.delete);
	}

	static getInstance(): UnitRouter {
		if (!UnitRouter.instance) {
			UnitRouter.instance = new UnitRouter();
		}
		return UnitRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
