import { Router } from "express";

import { ProductUnitController } from "@controllers/ProductUnitController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import CommonValidator from "@validators/CommonValidator";
import ProductUnitValidator from "@validators/ProductUnitValidator";

export class ProductUnitRouter {
	private static instance: ProductUnitRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("products.view"), ProductUnitValidator.list, ProductUnitController.getAll);
		this.router.get("/:id", PermissionMiddleware.require("products.view"), CommonValidator.resourceId, ProductUnitController.getById);
		this.router.post("/", PermissionMiddleware.require("products.update"), ProductUnitValidator.create, ProductUnitController.create);
		this.router.put("/:id", PermissionMiddleware.require("products.update"), ProductUnitValidator.update, ProductUnitController.update);
		this.router.delete("/:id", PermissionMiddleware.require("products.archive"), CommonValidator.resourceId, ProductUnitController.delete);
	}

	static getInstance(): ProductUnitRouter {
		if (!ProductUnitRouter.instance) {
			ProductUnitRouter.instance = new ProductUnitRouter();
		}
		return ProductUnitRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
