import { Router } from "express";

import { ProductController } from "@controllers/ProductController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import CommonValidator from "@validators/CommonValidator";
import ProductValidator from "@validators/ProductValidator";

export class ProductRouter {
	private static instance: ProductRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("products.view"), ProductValidator.list, ProductController.getAll);
		this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("products.view"), CommonValidator.resourceId, ProductController.getById);
		this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("products.create"), ProductValidator.create, ProductController.create);
		this.router.put("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("products.update"), ProductValidator.update, ProductController.update);
		this.router.delete("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("products.archive"), CommonValidator.resourceId, ProductController.delete);
	}

	static getInstance(): ProductRouter {
		if (!ProductRouter.instance) {
			ProductRouter.instance = new ProductRouter();
		}
		return ProductRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
