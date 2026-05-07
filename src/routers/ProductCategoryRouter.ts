import { Router } from "express";

import { ProductCategoryController } from "@controllers/ProductCategoryController";
import CommonValidator from "@validators/CommonValidator";
import ProductCategoryValidator from "@validators/ProductCategoryValidator";

export class ProductCategoryRouter {
	private static instance: ProductCategoryRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", ProductCategoryValidator.list, ProductCategoryController.getAll);
		this.router.get("/:id", CommonValidator.resourceId, ProductCategoryController.getById);
		this.router.post("/", ProductCategoryValidator.create, ProductCategoryController.create);
		this.router.put("/:id", ProductCategoryValidator.update, ProductCategoryController.update);
		this.router.delete("/:id", CommonValidator.resourceId, ProductCategoryController.delete);
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
