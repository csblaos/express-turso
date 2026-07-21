import { Router } from "express";

import { ProductController } from "@controllers/ProductController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import CommonValidator from "@validators/CommonValidator";
import ProductValidator from "@validators/ProductValidator";

export class ProductRouter {
	private static instance: ProductRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("products.view"), ProductValidator.list, ProductController.getAll);
		this.router.post(
			"/import",
			PermissionMiddleware.require("products.create"),
			PermissionMiddleware.require("products.update"),
			ProductValidator.importRows,
			ProductController.importRows,
		);
		this.router.get("/:id", PermissionMiddleware.require("products.view"), CommonValidator.resourceId, ProductController.getById);
		this.router.post("/:id/variants/bulk", PermissionMiddleware.require("products.create"), ProductValidator.bulkCreateVariants, ProductController.bulkCreateVariants);
		this.router.get("/:id/cost-adjustments", PermissionMiddleware.require("products.update_cost"), CommonValidator.resourceId, ProductController.listCostAdjustments);
		this.router.post("/:id/cost-adjustments", PermissionMiddleware.require("products.update_cost"), ProductValidator.adjustCost, ProductController.adjustCost);
		this.router.patch(
			"/:id/status",
			ProductValidator.setStatus,
			(req, res, next) => {
				const active = Number((req.body as Record<string, unknown>)?.active);
				const permissionKey = active === 0 ? "products.archive" : "products.update";
				return PermissionMiddleware.require(permissionKey)(req, res, next);
			},
			ProductController.setStatus,
		);
		this.router.post("/", PermissionMiddleware.require("products.create"), ProductValidator.create, ProductController.create);
		this.router.put("/:id", PermissionMiddleware.require("products.update"), ProductValidator.update, ProductController.update);
		this.router.delete("/:id", PermissionMiddleware.require("products.archive"), CommonValidator.resourceId, ProductController.delete);
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
