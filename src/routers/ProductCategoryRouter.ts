import { Router } from "express";

import { ProductCategoryController } from "@controllers/ProductCategoryController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import CommonValidator from "@validators/CommonValidator";
import ProductCategoryValidator from "@validators/ProductCategoryValidator";

export class ProductCategoryRouter {
	private static instance: ProductCategoryRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("products.view"), ProductCategoryValidator.list, ProductCategoryController.getAll);
		this.router.get("/:id", PermissionMiddleware.require("products.view"), CommonValidator.resourceId, ProductCategoryController.getById);
		this.router.post("/", PermissionMiddleware.require("products.create"), ProductCategoryValidator.create, ProductCategoryController.create);
		this.router.put("/:id", PermissionMiddleware.require("products.update"), ProductCategoryValidator.update, ProductCategoryController.update);
		this.router.delete("/:id", PermissionMiddleware.require("products.archive"), CommonValidator.resourceId, ProductCategoryController.delete);
	}

	static getInstance(): ProductCategoryRouter {
		if (!ProductCategoryRouter.instance) {
			ProductCategoryRouter.instance = new ProductCategoryRouter();
		}
		return ProductCategoryRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
